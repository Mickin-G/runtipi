import * as argon2 from 'argon2';
import validator from 'validator';
import { TotpAuthenticator } from '@/server/utils/totp';
import { generateSessionId } from '@/server/common/get-server-auth-session';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { AuthQueries } from '@/server/queries/auth/auth.queries';
import { Context } from '@/server/context';
import { getConfig } from '../../core/TipiConfig';
import TipiCache from '../../core/TipiCache';
import { fileExists, unlinkFile } from '../../common/fs.helpers';
import { decrypt, encrypt } from '../../utils/encryption';

type UsernamePasswordInput = {
  username: string;
  password: string;
};

export class AuthServiceClass {
  private queries;

  constructor(p: NodePgDatabase) {
    this.queries = new AuthQueries(p);
  }

  /**
   * Authenticate user with given username and password
   *
   * @param {UsernamePasswordInput} input - An object containing the user's username and password
   * @param {Request} req - The Next.js request object
   * @returns {Promise<{token:string}>} - A promise that resolves to an object containing the JWT token
   */
  public login = async (input: UsernamePasswordInput, req: Context['req']) => {
    const { password, username } = input;
    const user = await this.queries.getUserByUsername(username);

    if (!user) {
      throw new Error('User not found');
    }

    const isPasswordValid = await argon2.verify(user.password, password);

    if (!isPasswordValid) {
      throw new Error('Wrong password');
    }

    if (user.totpEnabled) {
      const totpSessionId = generateSessionId('otp');
      await TipiCache.set(totpSessionId, user.id.toString());
      return { totpSessionId };
    }

    req.session.userId = user.id;
    await TipiCache.set(`session:${user.id}:${req.session.id}`, req.session.id);

    return {};
  };

  /**
   * Verify TOTP code and return a JWT token
   *
   * @param {object} params - An object containing the TOTP session ID and the TOTP code
   * @param {string} params.totpSessionId - The TOTP session ID
   * @param {string} params.totpCode - The TOTP code
   * @param {Request} req - The Next.js request object
   * @returns {Promise<{token:string}>} - A promise that resolves to an object containing the JWT token
   */
  public verifyTotp = async (params: { totpSessionId: string; totpCode: string }, req: Context['req']) => {
    const { totpSessionId, totpCode } = params;
    const userId = await TipiCache.get(totpSessionId);

    if (!userId) {
      throw new Error('TOTP session not found');
    }

    const user = await this.queries.getUserById(Number(userId));

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.totpEnabled || !user.totpSecret || !user.salt) {
      throw new Error('TOTP is not enabled for this user');
    }

    const totpSecret = decrypt(user.totpSecret, user.salt);
    const isValid = TotpAuthenticator.check(totpCode, totpSecret);

    if (!isValid) {
      throw new Error('Invalid TOTP code');
    }

    req.session.userId = user.id;

    return true;
  };

  /**
   * Given a userId returns the TOTP URI and the secret key
   *
   * @param {object} params - An object containing the userId and the user's password
   * @param {number} params.userId - The user's ID
   * @param {string} params.password - The user's password
   * @returns {Promise<{uri: string, key: string}>} - A promise that resolves to an object containing the TOTP URI and the secret key
   */
  public getTotpUri = async (params: { userId: number; password: string }) => {
    if (getConfig().demoMode) {
      throw new Error('2FA is not available in demo mode');
    }

    const { userId, password } = params;

    const user = await this.queries.getUserById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    const isPasswordValid = await argon2.verify(user.password, password);
    if (!isPasswordValid) {
      throw new Error('Invalid password');
    }

    if (user.totpEnabled) {
      throw new Error('TOTP is already enabled for this user');
    }

    let { salt } = user;
    const newTotpSecret = TotpAuthenticator.generateSecret();

    if (!salt) {
      salt = generateSessionId('');
    }

    const encryptedTotpSecret = encrypt(newTotpSecret, salt);

    await this.queries.updateUser(userId, { totpSecret: encryptedTotpSecret, salt });

    const uri = TotpAuthenticator.keyuri(user.username, 'Runtipi', newTotpSecret);

    return { uri, key: newTotpSecret };
  };

  public setupTotp = async (params: { userId: number; totpCode: string }) => {
    if (getConfig().demoMode) {
      throw new Error('2FA is not available in demo mode');
    }

    const { userId, totpCode } = params;
    const user = await this.queries.getUserById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    if (user.totpEnabled || !user.totpSecret || !user.salt) {
      throw new Error('TOTP is already enabled for this user');
    }

    const totpSecret = decrypt(user.totpSecret, user.salt);
    const isValid = TotpAuthenticator.check(totpCode, totpSecret);

    if (!isValid) {
      throw new Error('Invalid TOTP code');
    }

    await this.queries.updateUser(userId, { totpEnabled: true });

    return true;
  };

  public disableTotp = async (params: { userId: number; password: string }) => {
    const { userId, password } = params;

    const user = await this.queries.getUserById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.totpEnabled) {
      throw new Error('TOTP is not enabled for this user');
    }

    const isPasswordValid = await argon2.verify(user.password, password);
    if (!isPasswordValid) {
      throw new Error('Invalid password');
    }

    await this.queries.updateUser(userId, { totpEnabled: false, totpSecret: null });

    return true;
  };

  /**
   * Creates a new user with the provided email and password and returns a session token
   *
   * @param {UsernamePasswordInput} input - An object containing the email and password fields
   * @param {Request} req - The Next.js request object
   * @returns {Promise<{token: string}>} - An object containing the session token
   * @throws {Error} - If the email or password is missing, the email is invalid or the user already exists
   */
  public register = async (input: UsernamePasswordInput, req: Context['req']) => {
    const operators = await this.queries.getOperators();

    if (operators.length > 0) {
      throw new Error('There is already an admin user. Please login to create a new user from the admin panel.');
    }

    const { password, username } = input;
    const email = username.trim().toLowerCase();

    if (!username || !password) {
      throw new Error('Missing email or password');
    }

    if (username.length < 3 || !validator.isEmail(email)) {
      throw new Error('Invalid username');
    }

    const user = await this.queries.getUserByUsername(email);

    if (user) {
      throw new Error('User already exists');
    }

    const hash = await argon2.hash(password);

    const newUser = await this.queries.createUser({ username: email, password: hash, operator: true });

    if (!newUser) {
      throw new Error('Error creating user');
    }

    req.session.userId = newUser.id;
    await TipiCache.set(`session:${newUser.id}:${req.session.id}`, req.session.id);

    return true;
  };

  /**
   * Retrieves the user with the provided ID
   *
   * @param {number|undefined} userId - The user ID to retrieve
   * @returns {Promise<{id: number, username: string} | null>} - An object containing the user's id and email, or null if the user is not found
   */
  public me = async (userId: number | undefined) => {
    if (!userId) return null;

    const user = await this.queries.getUserDtoById(userId);

    if (!user) return null;

    return user;
  };

  /**
   * Logs out the current user by removing the session token
   *
   * @param  {Request} req - The Next.js request object
   * @returns {Promise<boolean>} - Returns true if the session token is removed successfully
   */
  public static logout = async (req: Context['req']): Promise<boolean> => {
    if (!req.session) {
      return true;
    }

    req.session.destroy(() => {});

    return true;
  };

  /**
   * Check if the system is configured and has at least one user
   *
   * @returns {Promise<boolean>} - A boolean indicating if the system is configured or not
   */
  public isConfigured = async (): Promise<boolean> => {
    const operators = await this.queries.getOperators();

    return operators.length > 0;
  };

  /**
   * Change the password of the operator user
   *
   * @param {object} params - An object containing the new password
   * @param {string} params.newPassword - The new password
   * @returns {Promise<string>} - The username of the operator user
   * @throws {Error} - If the operator user is not found or if there is no password change request
   */
  public changeOperatorPassword = async (params: { newPassword: string }) => {
    if (!AuthServiceClass.checkPasswordChangeRequest()) {
      throw new Error('No password change request found');
    }

    const { newPassword } = params;

    const user = await this.queries.getFirstOperator();

    if (!user) {
      throw new Error('Operator user not found');
    }

    const hash = await argon2.hash(newPassword);

    await this.queries.updateUser(user.id, { password: hash, totpEnabled: false, totpSecret: null });

    await unlinkFile(`/runtipi/state/password-change-request`);

    return { email: user.username };
  };

  /*
   * Check if there is a pending password change request for the given email
   * Returns true if there is a file in the password change requests folder with the given email
   *
   * @returns {boolean} - A boolean indicating if there is a password change request or not
   */
  public static checkPasswordChangeRequest = () => {
    if (fileExists(`/runtipi/state/password-change-request`)) {
      return true;
    }

    return false;
  };

  /*
   * If there is a pending password change request, remove it
   * Returns true if the file is removed successfully
   *
   * @returns {boolean} - A boolean indicating if the file is removed successfully or not
   * @throws {Error} - If the file cannot be removed
   */
  public static cancelPasswordChangeRequest = async () => {
    if (fileExists(`/runtipi/state/password-change-request`)) {
      await unlinkFile(`/runtipi/state/password-change-request`);
    }

    return true;
  };

  /**
   * Given a user ID, destroy all sessions for that user
   *
   * @param {number} userId - The user ID
   */
  private destroyAllSessionsByUserId = async (userId: number) => {
    const sessions = await TipiCache.getByPrefix(`session:${userId}:`);
    for (const session of sessions) {
      await TipiCache.del(session.key);
    }
  };

  public changePassword = async (params: { currentPassword: string; newPassword: string; userId: number }) => {
    if (getConfig().demoMode) {
      throw new Error('Changing password is not allowed in demo mode');
    }

    const { currentPassword, newPassword, userId } = params;

    const user = await this.queries.getUserById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    const valid = await argon2.verify(user.password, currentPassword);

    if (!valid) {
      throw new Error('Current password is invalid');
    }

    if (newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    const hash = await argon2.hash(newPassword);
    await this.queries.updateUser(user.id, { password: hash });
    await this.destroyAllSessionsByUserId(user.id);

    return true;
  };
}
