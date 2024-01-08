import fs from 'fs-extra';
import * as argon2 from 'argon2';
import { faker } from '@faker-js/faker';
import { TotpAuthenticator } from '@/server/utils/totp';
import { generateSessionId } from '@/server/common/session.helpers';
import { fromAny } from '@total-typescript/shoehorn';
import { mockInsert, mockQuery, mockSelect } from '@/tests/mocks/drizzle';
import { createDatabase, clearDatabase, closeDatabase, TestDatabase } from '@/server/tests/test-utils';
import { v4 } from 'uuid';
import { encrypt } from '../../utils/encryption';
import { TipiConfig } from '../../core/TipiConfig';
import { createUser, getUserByEmail, getUserById } from '../../tests/user.factory';
import { AuthServiceClass } from './auth.service';
import { TipiCache } from '../../core/TipiCache';

let AuthService: AuthServiceClass;
let database: TestDatabase;
const TEST_SUITE = 'authservice';

const cache = new TipiCache('auth.service.test.ts');

let cookieStore: Record<string, string> = {};
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    set: (name: string, value: string) => {
      cookieStore[name] = value;
    },
    get: (name: string) => {
      return cookieStore[name];
    },
  })),
}));

beforeAll(async () => {
  await TipiConfig.setConfig('jwtSecret', 'test');
  database = await createDatabase(TEST_SUITE);
  AuthService = new AuthServiceClass(database.db);
});

beforeEach(async () => {
  await TipiConfig.setConfig('demoMode', false);
  await clearDatabase(database);
  cookieStore = {};
});

afterAll(async () => {
  await closeDatabase(database);
  await cache.close();
});

describe('Login', () => {
  it('Should correclty set session cookie', async () => {
    // arrange
    const email = faker.internet.email();
    const user = await createUser({ email }, database);

    // act
    const { sessionId } = await AuthService.login({ username: email, password: 'password' });

    const sessionKey = `session:${sessionId}`;
    const userId = await cache.get(sessionKey);
    const cookie = cookieStore['tipi.sid'];

    // assert
    expect(userId).toBeDefined();
    expect(userId).not.toBeNull();
    expect(userId).toBe(user.id.toString());
    expect(cookie).toBeDefined();
  });

  it('Should throw if user does not exist', async () => {
    await expect(AuthService.login({ username: 'test', password: 'test' })).rejects.toThrowError('server-messages.errors.user-not-found');
  });

  it('Should throw if password is incorrect', async () => {
    const email = faker.internet.email();
    await createUser({ email }, database);
    await expect(AuthService.login({ username: email, password: 'wrong' })).rejects.toThrowError('server-messages.errors.invalid-credentials');
  });

  // TOTP
  it('should return a totp session if the user totpEnabled is true', async () => {
    // arrange
    const email = faker.internet.email();
    const totpSecret = TotpAuthenticator.generateSecret();
    await createUser({ email, totpEnabled: true, totpSecret }, database);

    // act
    const { totpSessionId } = await AuthService.login({ username: email, password: 'password' });

    // assert
    expect(totpSessionId).toBeDefined();
    expect(totpSessionId).not.toBeNull();
  });
});

describe('Test: verifyTotp', () => {
  it('should correctly log in user after totp is verified', async () => {
    // arrange
    const email = faker.internet.email();
    const salt = faker.lorem.word();
    const totpSecret = TotpAuthenticator.generateSecret();

    const encryptedTotpSecret = encrypt(totpSecret, salt);
    const user = await createUser({ email, totpEnabled: true, totpSecret: encryptedTotpSecret, salt }, database);
    const totpSessionId = generateSessionId('otp');
    const otp = TotpAuthenticator.generate(totpSecret);

    await cache.set(totpSessionId, user.id.toString());

    // act
    await AuthService.verifyTotp({ totpSessionId, totpCode: otp });
    const cookie = cookieStore['tipi.sid'];

    // assert
    expect(cookie).toBeDefined();
    expect(cookie).not.toBeNull();
  });

  it('should throw if the totp is incorrect', async () => {
    // arrange
    const email = faker.internet.email();
    const salt = faker.lorem.word();
    const totpSecret = TotpAuthenticator.generateSecret();
    const encryptedTotpSecret = encrypt(totpSecret, salt);
    const user = await createUser({ email, totpEnabled: true, totpSecret: encryptedTotpSecret, salt }, database);
    const totpSessionId = generateSessionId('otp');
    await cache.set(totpSessionId, user.id.toString());

    // act & assert
    await expect(AuthService.verifyTotp({ totpSessionId, totpCode: 'wrong' })).rejects.toThrowError('server-messages.errors.totp-invalid-code');
  });

  it('should throw if the totpSessionId is invalid', async () => {
    // arrange
    const email = faker.internet.email();
    const salt = faker.lorem.word();
    const totpSecret = TotpAuthenticator.generateSecret();
    const encryptedTotpSecret = encrypt(totpSecret, salt);
    const user = await createUser({ email, totpEnabled: true, totpSecret: encryptedTotpSecret, salt }, database);
    const totpSessionId = generateSessionId('otp');
    const otp = TotpAuthenticator.generate(totpSecret);

    await cache.set(totpSessionId, user.id.toString());

    // act & assert
    await expect(AuthService.verifyTotp({ totpSessionId: 'wrong', totpCode: otp })).rejects.toThrowError(
      'server-messages.errors.totp-session-not-found',
    );
  });

  it('should throw if the user does not exist', async () => {
    // arrange
    const totpSessionId = generateSessionId('otp');
    await cache.set(totpSessionId, '1234');

    // act & assert
    await expect(AuthService.verifyTotp({ totpSessionId, totpCode: '1234' })).rejects.toThrowError('server-messages.errors.user-not-found');
  });

  it('should throw if the user totpEnabled is false', async () => {
    // arrange
    const email = faker.internet.email();
    const salt = faker.lorem.word();
    const totpSecret = TotpAuthenticator.generateSecret();
    const encryptedTotpSecret = encrypt(totpSecret, salt);
    const user = await createUser({ email, totpEnabled: false, totpSecret: encryptedTotpSecret, salt }, database);
    const totpSessionId = generateSessionId('otp');
    const otp = TotpAuthenticator.generate(totpSecret);

    await cache.set(totpSessionId, user.id.toString());

    // act & assert
    await expect(AuthService.verifyTotp({ totpSessionId, totpCode: otp })).rejects.toThrowError('server-messages.errors.totp-not-enabled');
  });
});

describe('Test: getTotpUri', () => {
  it('should return a valid totp uri', async () => {
    // arrange
    const email = faker.internet.email();
    const user = await createUser({ email }, database);

    // act
    const { uri, key } = await AuthService.getTotpUri({ userId: user.id, password: 'password' });

    // assert
    expect(uri).toBeDefined();
    expect(uri).not.toBeNull();
    expect(key).toBeDefined();
    expect(key).not.toBeNull();
    expect(uri).toContain(key);
  });

  it('should create a new totp secret if the user does not have one', async () => {
    // arrange
    const email = faker.internet.email();
    const user = await createUser({ email }, database);

    // act
    await AuthService.getTotpUri({ userId: user.id, password: 'password' });
    const userFromDb = await getUserById(user.id, database);

    // assert
    expect(userFromDb).toBeDefined();
    expect(userFromDb).not.toBeNull();
    expect(userFromDb).toHaveProperty('totpSecret');
    expect(userFromDb).toHaveProperty('salt');
  });

  it('should regenerate a new totp secret if the user already has one', async () => {
    // arrange
    const email = faker.internet.email();
    const salt = faker.lorem.word();
    const totpSecret = TotpAuthenticator.generateSecret();
    const encryptedTotpSecret = encrypt(totpSecret, salt);
    const user = await createUser({ email, totpSecret: encryptedTotpSecret, salt }, database);

    // act
    await AuthService.getTotpUri({ userId: user.id, password: 'password' });
    const userFromDb = await getUserById(user.id, database);

    // assert
    expect(userFromDb).toBeDefined();
    expect(userFromDb).not.toBeNull();
    expect(userFromDb).toHaveProperty('totpSecret');
    expect(userFromDb).toHaveProperty('salt');
    expect(userFromDb?.totpSecret).not.toEqual(encryptedTotpSecret);
    expect(userFromDb?.salt).toEqual(salt);
  });

  it('should throw an error if user has already configured totp', async () => {
    // arrange
    const email = faker.internet.email();
    const user = await createUser({ email, totpEnabled: true }, database);

    // act & assert
    await expect(AuthService.getTotpUri({ userId: user.id, password: 'password' })).rejects.toThrowError(
      'server-messages.errors.totp-already-enabled',
    );
  });

  it('should throw an error if the user password is incorrect', async () => {
    // arrange
    const email = faker.internet.email();
    const user = await createUser({ email }, database);

    // act & assert
    await expect(AuthService.getTotpUri({ userId: user.id, password: 'wrong' })).rejects.toThrowError('server-messages.errors.invalid-password');
  });

  it('should throw an error if the user does not exist', async () => {
    // arrange
    const userId = 11;

    // act & assert
    await expect(AuthService.getTotpUri({ userId, password: 'password' })).rejects.toThrowError('server-messages.errors.user-not-found');
  });

  it('should throw an error if app is in demo mode', async () => {
    // arrange
    await TipiConfig.setConfig('demoMode', true);
    const email = faker.internet.email();
    const user = await createUser({ email }, database);

    // act & assert
    await expect(AuthService.getTotpUri({ userId: user.id, password: 'password' })).rejects.toThrowError(
      'server-messages.errors.not-allowed-in-demo',
    );
  });
});

describe('Test: setupTotp', () => {
  it('should enable totp for the user', async () => {
    // arrange
    const email = faker.internet.email();
    const totpSecret = TotpAuthenticator.generateSecret();
    const salt = faker.lorem.word();
    const encryptedTotpSecret = encrypt(totpSecret, salt);

    const user = await createUser({ email, totpSecret: encryptedTotpSecret, salt }, database);
    const otp = TotpAuthenticator.generate(totpSecret);

    // act
    await AuthService.setupTotp({ userId: user.id, totpCode: otp });
    const userFromDb = await getUserById(user.id, database);

    // assert
    expect(userFromDb).toBeDefined();
    expect(userFromDb).not.toBeNull();
    expect(userFromDb).toHaveProperty('totpEnabled');
    expect(userFromDb?.totpEnabled).toBeTruthy();
  });

  it('should throw if the user has already enabled totp', async () => {
    // arrange
    const email = faker.internet.email();
    const user = await createUser({ email, totpEnabled: true }, database);

    // act & assert
    await expect(AuthService.setupTotp({ userId: user.id, totpCode: '1234' })).rejects.toThrowError('server-messages.errors.totp-already-enabled');
  });

  it('should throw if the user does not exist', async () => {
    // arrange
    const userId = 11;

    // act & assert
    await expect(AuthService.setupTotp({ userId, totpCode: '1234' })).rejects.toThrowError('server-messages.errors.user-not-found');
  });

  it('should throw if the otp is invalid', async () => {
    // arrange
    const email = faker.internet.email();
    const totpSecret = TotpAuthenticator.generateSecret();
    const salt = faker.lorem.word();
    const encryptedTotpSecret = encrypt(totpSecret, salt);

    const user = await createUser({ email, totpSecret: encryptedTotpSecret, salt }, database);

    // act & assert
    await expect(AuthService.setupTotp({ userId: user.id, totpCode: '1234' })).rejects.toThrowError('server-messages.errors.totp-invalid-code');
  });

  it('should throw an error if app is in demo mode', async () => {
    // arrange
    await TipiConfig.setConfig('demoMode', true);
    const email = faker.internet.email();
    const user = await createUser({ email }, database);

    // act & assert
    await expect(AuthService.setupTotp({ userId: user.id, totpCode: '1234' })).rejects.toThrowError('server-messages.errors.not-allowed-in-demo');
  });
});

describe('Test: disableTotp', () => {
  it('should disable totp for the user', async () => {
    // arrange
    const email = faker.internet.email();
    const user = await createUser({ email, totpEnabled: true }, database);

    // act
    await AuthService.disableTotp({ userId: user.id, password: 'password' });
    const userFromDb = await getUserById(user.id, database);

    // assert
    expect(userFromDb).toBeDefined();
    expect(userFromDb).not.toBeNull();
    expect(userFromDb).toHaveProperty('totpEnabled');
    expect(userFromDb?.totpEnabled).toBeFalsy();
  });

  it('should throw if the user has already disabled totp', async () => {
    // arrange
    const email = faker.internet.email();
    const user = await createUser({ email, totpEnabled: false }, database);

    // act & assert
    await expect(AuthService.disableTotp({ userId: user.id, password: 'password' })).rejects.toThrowError('server-messages.errors.totp-not-enabled');
  });

  it('should throw if the user does not exist', async () => {
    // arrange
    const userId = 11;

    // act & assert
    await expect(AuthService.disableTotp({ userId, password: 'password' })).rejects.toThrowError('server-messages.errors.user-not-found');
  });

  it('should throw if the password is invalid', async () => {
    // arrange
    const email = faker.internet.email();
    const user = await createUser({ email, totpEnabled: true }, database);

    // act & assert
    await expect(AuthService.disableTotp({ userId: user.id, password: 'wrong' })).rejects.toThrowError('server-messages.errors.invalid-password');
  });
});

describe('Register', () => {
  it('Should correctly set session cookie', async () => {
    // arrange
    const email = faker.internet.email();

    // act
    await AuthService.register({ username: email, password: 'password' });
    const cookie = cookieStore['tipi.sid'];

    // assert
    expect(cookie).toBeDefined();
    expect(cookie).not.toBeNull();
  });

  it('Should correctly trim and lowercase email', async () => {
    // arrange
    const email = faker.internet.email();

    // act
    await AuthService.register({ username: email, password: 'test' });
    const user = await getUserByEmail(email.toLowerCase().trim(), database);

    // assert
    expect(user).toBeDefined();
    expect(user?.username).toBe(email.toLowerCase().trim());
  });

  it('should throw if there is already an operator', async () => {
    // Arrange
    const email = faker.internet.email();

    // Act & Assert
    await createUser({ email, operator: true }, database);
    await expect(AuthService.register({ username: email, password: 'test' })).rejects.toThrowError('server-messages.errors.admin-already-exists');
  });

  it('Should throw if user already exists', async () => {
    // Arrange
    const email = faker.internet.email();

    // Act & Assert
    await createUser({ email, operator: false }, database);
    await expect(AuthService.register({ username: email, password: 'test' })).rejects.toThrowError('server-messages.errors.user-already-exists');
  });

  it('Should throw if email is not provided', async () => {
    await expect(AuthService.register({ username: '', password: 'test' })).rejects.toThrowError('server-messages.errors.missing-email-or-password');
  });

  it('Should throw if password is not provided', async () => {
    await expect(AuthService.register({ username: faker.internet.email(), password: '' })).rejects.toThrowError(
      'server-messages.errors.missing-email-or-password',
    );
  });

  it('Password is correctly hashed', async () => {
    // arrange
    const email = faker.internet.email().toLowerCase().trim();

    // act
    await AuthService.register({ username: email, password: 'test' });
    const user = await getUserByEmail(email, database);
    const isPasswordValid = await argon2.verify(user?.password || '', 'test');

    // assert
    expect(isPasswordValid).toBe(true);
  });

  it('Should throw if email is invalid', async () => {
    await expect(AuthService.register({ username: 'test', password: 'test' })).rejects.toThrowError('server-messages.errors.invalid-username');
  });

  it('should throw if db fails to insert user', async () => {
    // Arrange
    const email = faker.internet.email();
    const mockDatabase = { select: mockSelect([]), insert: mockInsert([]), query: mockQuery(undefined) };
    const newAuthService = new AuthServiceClass(fromAny(mockDatabase));

    // Act & Assert
    await expect(newAuthService.register({ username: email, password: 'test' })).rejects.toThrowError('server-messages.errors.error-creating-user');
  });
});

describe('Test: logout', () => {
  it('Should return true if there is no session to delete', async () => {
    // act
    const result = await AuthService.logout('session');

    // assert
    expect(result).toBe(true);
  });

  it('Should destroy session upon logount', async () => {
    // arrange
    const sessionId = v4();

    await cache.set(`session:${sessionId}`, '1');

    // act
    const result = await AuthService.logout(sessionId);
    const session = await cache.get(`session:${sessionId}`);

    // assert
    expect(result).toBe(true);
    expect(session).toBeUndefined();
  });
});

describe('Test: me', () => {
  it('Should return null if userId is not provided', async () => {
    // Act
    // @ts-expect-error - ctx is missing session
    const result = await AuthService.me();

    // Assert
    expect(result).toBeNull();
  });

  it('Should return null if user does not exist', async () => {
    // Act
    const result = await AuthService.me(1);

    // Assert
    expect(result).toBeNull();
  });

  it('Should return user if user exists', async () => {
    // Arrange
    const email = faker.internet.email();
    const user = await createUser({ email }, database);

    // Act
    const result = await AuthService.me(user.id);

    // Assert
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('username');
  });
});

describe('Test: isConfigured', () => {
  it('Should return false if no user exists', async () => {
    // Act
    const result = await AuthService.isConfigured();

    // Assert
    expect(result).toBe(false);
  });

  it('Should return true if user exists', async () => {
    // Arrange
    const email = faker.internet.email();
    await createUser({ email }, database);

    // Act
    const result = await AuthService.isConfigured();

    // Assert
    expect(result).toBe(true);
  });
});

describe('Test: changeOperatorPassword', () => {
  it('should change the password of the operator user', async () => {
    // Arrange
    const email = faker.internet.email();
    const user = await createUser({ email }, database);
    const newPassword = faker.internet.password();
    // @ts-expect-error - mocking fs
    fs.__createMockFiles({ '/runtipi/state/password-change-request': '' });

    // Act
    const result = await AuthService.changeOperatorPassword({ newPassword });

    // Assert
    expect(result.email).toBe(email.toLowerCase());
    const updatedUser = await getUserById(user.id, database);
    expect(updatedUser?.password).not.toBe(user.password);
  });

  it('should throw if the password change request file does not exist', async () => {
    // Arrange
    const email = faker.internet.email();
    await createUser({ email }, database);
    const newPassword = faker.internet.password();
    // @ts-expect-error - mocking fs
    fs.__createMockFiles({});

    // Act & Assert
    await expect(AuthService.changeOperatorPassword({ newPassword })).rejects.toThrowError('server-messages.errors.no-change-password-request');
  });

  it('should throw if there is no operator user', async () => {
    // Arrange
    const email = faker.internet.email();
    await createUser({ email, operator: false }, database);
    const newPassword = faker.internet.password();
    // @ts-expect-error - mocking fs
    fs.__createMockFiles({ '/runtipi/state/password-change-request': '' });

    // Act & Assert
    await expect(AuthService.changeOperatorPassword({ newPassword })).rejects.toThrowError('server-messages.errors.operator-not-found');
  });

  it('should reset totpSecret and totpEnabled if totp is enabled', async () => {
    // Arrange
    const email = faker.internet.email();
    const user = await createUser({ email, totpEnabled: true }, database);
    const newPassword = faker.internet.password();
    // @ts-expect-error - mocking fs
    fs.__createMockFiles({ '/runtipi/state/password-change-request': '' });

    // Act
    const result = await AuthService.changeOperatorPassword({ newPassword });

    // Assert
    expect(result.email).toBe(email.toLowerCase());
    const updatedUser = await getUserById(user.id, database);
    expect(updatedUser?.password).not.toBe(user.password);
    expect(updatedUser?.totpEnabled).toBe(false);
    expect(updatedUser?.totpSecret).toBeNull();
  });
});

describe('Test: checkPasswordChangeRequest', () => {
  it('should return true if the password change request file exists', async () => {
    // Arrange
    // @ts-expect-error - mocking fs
    fs.__createMockFiles({ '/runtipi/state/password-change-request': '' });

    // Act
    const result = AuthServiceClass.checkPasswordChangeRequest();

    // Assert
    expect(result).toBe(true);
  });

  it('should return false if the password change request file does not exist', async () => {
    // Arrange
    // @ts-expect-error - mocking fs
    fs.__createMockFiles({});

    // Act
    const result = AuthServiceClass.checkPasswordChangeRequest();

    // Assert
    expect(result).toBe(false);
  });
});

describe('Test: cancelPasswordChangeRequest', () => {
  it('should delete the password change request file', async () => {
    // Arrange
    // @ts-expect-error - mocking fs
    fs.__createMockFiles({ '/runtipi/state/password-change-request': '' });

    // Act
    await AuthServiceClass.cancelPasswordChangeRequest();

    // Assert
    expect(fs.existsSync('/runtipi/state/password-change-request')).toBe(false);
  });
});

describe('Test: changePassword', () => {
  it('should change the password of the user', async () => {
    // arrange
    const email = faker.internet.email();
    const user = await createUser({ email }, database);
    const newPassword = faker.internet.password();

    // act
    await AuthService.changePassword({ userId: user.id, newPassword, currentPassword: 'password' });

    // assert
    const updatedUser = await getUserById(user.id, database);
    expect(updatedUser?.password).not.toBe(user.password);
  });

  it('should throw if the user does not exist', async () => {
    // arrange
    const newPassword = faker.internet.password();

    // act & assert
    await expect(AuthService.changePassword({ userId: 1, newPassword, currentPassword: 'password' })).rejects.toThrowError(
      'server-messages.errors.user-not-found',
    );
  });

  it('should throw if the password is incorrect', async () => {
    // arrange
    const email = faker.internet.email();
    const user = await createUser({ email }, database);
    const newPassword = faker.internet.password();

    // act & assert
    await expect(AuthService.changePassword({ userId: user.id, newPassword, currentPassword: 'wrongpassword' })).rejects.toThrowError(
      'server-messages.errors.invalid-password',
    );
  });

  it('should throw if password is less than 8 characters', async () => {
    // arrange
    const email = faker.internet.email();
    const user = await createUser({ email }, database);
    const newPassword = faker.internet.password(7);

    // act & assert
    await expect(AuthService.changePassword({ userId: user.id, newPassword, currentPassword: 'password' })).rejects.toThrowError(
      'server-messages.errors.invalid-password-length',
    );
  });

  it('should throw if instance is in demo mode', async () => {
    // arrange
    await TipiConfig.setConfig('demoMode', true);
    const email = faker.internet.email();
    const user = await createUser({ email }, database);
    const newPassword = faker.internet.password();

    // act & assert
    await expect(AuthService.changePassword({ userId: user.id, newPassword, currentPassword: 'password' })).rejects.toThrowError(
      'server-messages.errors.not-allowed-in-demo',
    );
  });

  it('should delete all sessions for the user', async () => {
    // arrange
    const email = faker.internet.email();
    const user = await createUser({ email }, database);
    const newPassword = faker.internet.password();
    await cache.set(`session:${user.id}:${faker.lorem.word()}`, 'test');

    // act
    await AuthService.changePassword({ userId: user.id, newPassword, currentPassword: 'password' });

    // assert
    // eslint-disable-next-line testing-library/no-await-sync-queries
    const sessions = await cache.getByPrefix(`session:${user.id}:`);
    expect(sessions).toHaveLength(0);
  });
});

describe('test: changeLocale()', () => {
  it('should change the locale of the user', async () => {
    // arrange
    const email = faker.internet.email();
    const user = await createUser({ email }, database);
    const locale = 'fr-FR';

    // act
    await AuthService.changeLocale({ userId: user.id, locale });

    // assert
    const updatedUser = await getUserById(user.id, database);
    expect(updatedUser?.locale).toBe(locale);
  });

  it('should throw if the user does not exist', async () => {
    // arrange
    const locale = 'fr-FR';

    // act & assert
    await expect(AuthService.changeLocale({ userId: 1, locale })).rejects.toThrowError('server-messages.errors.user-not-found');
  });

  it('should throw if the locale is invalid', async () => {
    // arrange
    const email = faker.internet.email();
    const user = await createUser({ email }, database);
    const locale = 'invalid';

    // act & assert
    await expect(AuthService.changeLocale({ userId: user.id, locale })).rejects.toThrowError('server-messages.errors.invalid-locale');
  });
});
