import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { faker } from '@faker-js/faker';
import { setConfig } from '../../core/TipiConfig';
import { createUser } from '../../tests/user.factory';
import AuthService from './auth.service';
import { prisma } from '../../db/client';
import { Context } from '../../context';
import TipiCache from '../../core/TipiCache';

jest.mock('redis');

beforeAll(async () => {
  setConfig('jwtSecret', 'test');
});

beforeEach(async () => {
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

const ctx = { prisma } as Context;

describe('Login', () => {
  it('Should return a valid jsonwebtoken containing a user id', async () => {
    // Arrange
    const email = faker.internet.email();
    const user = await createUser(email);

    // Act
    const { token } = await AuthService.login({ username: email, password: 'password' }, ctx);
    const decoded = jwt.verify(token, 'test') as jwt.JwtPayload;

    // Assert
    expect(decoded).toBeDefined();
    expect(decoded).toBeDefined();
    expect(decoded).not.toBeNull();
    expect(decoded).toHaveProperty('id');
    expect(decoded.id).toBe(user.id);
    expect(decoded).toHaveProperty('iat');
    expect(decoded).toHaveProperty('exp');
    expect(decoded).toHaveProperty('session');
  });

  it('Should throw if user does not exist', async () => {
    await expect(AuthService.login({ username: 'test', password: 'test' }, ctx)).rejects.toThrowError('User not found');
  });

  it('Should throw if password is incorrect', async () => {
    const email = faker.internet.email();
    await createUser(email);
    await expect(AuthService.login({ username: email, password: 'wrong' }, ctx)).rejects.toThrowError('Wrong password');
  });
});

describe('Register', () => {
  it('Should return valid jsonwebtoken after register', async () => {
    // Arrange
    const email = faker.internet.email();

    // Act
    const { token } = await AuthService.register({ username: email, password: 'password' }, ctx);
    const decoded = jwt.verify(token, 'test') as jwt.JwtPayload;

    // Assert
    expect(decoded).toBeDefined();
    expect(decoded).not.toBeNull();
    expect(decoded).toHaveProperty('id');
    expect(decoded).toHaveProperty('iat');
    expect(decoded).toHaveProperty('exp');
    expect(decoded).toHaveProperty('session');
  });

  it('Should correctly trim and lowercase email', async () => {
    // Arrange
    const email = faker.internet.email();

    // Act
    await AuthService.register({ username: email, password: 'test' }, ctx);
    const user = await prisma.user.findFirst({ where: { username: email.toLowerCase().trim() } });

    // Assert
    expect(user).toBeDefined();
    expect(user?.username).toBe(email.toLowerCase().trim());
  });

  it('Should throw if user already exists', async () => {
    // Arrange
    const email = faker.internet.email();

    // Act & Assert
    await createUser(email);
    await expect(AuthService.register({ username: email, password: 'test' }, ctx)).rejects.toThrowError('User already exists');
  });

  it('Should throw if email is not provided', async () => {
    await expect(AuthService.register({ username: '', password: 'test' }, ctx)).rejects.toThrowError('Missing email or password');
  });

  it('Should throw if password is not provided', async () => {
    await expect(AuthService.register({ username: faker.internet.email(), password: '' }, ctx)).rejects.toThrowError('Missing email or password');
  });

  it('Password is correctly hashed', async () => {
    // Arrange
    const email = faker.internet.email().toLowerCase().trim();

    // Act
    await AuthService.register({ username: email, password: 'test' }, ctx);
    const user = await prisma.user.findUnique({ where: { username: email } });
    const isPasswordValid = await argon2.verify(user?.password || '', 'test');

    // Assert
    expect(isPasswordValid).toBe(true);
  });

  it('Should throw if email is invalid', async () => {
    await expect(AuthService.register({ username: 'test', password: 'test' }, ctx)).rejects.toThrowError('Invalid username');
  });
});

describe('Test: logout', () => {
  it('Should return true if there is no session to delete', async () => {
    // Act
    const result = await AuthService.logout();

    // Assert
    expect(result).toBe(true);
  });

  it('Should delete session from cache', async () => {
    // Arrange
    const session = faker.random.alphaNumeric(32);
    await TipiCache.set(session, 'test');
    expect(await TipiCache.get(session)).toBe('test');

    // Act
    const result = await AuthService.logout(session);

    // Assert
    expect(result).toBe(true);
    expect(await TipiCache.get('session')).toBeUndefined();
  });
});

describe('Test: refreshToken', () => {
  it('Should return null if session is not provided', async () => {
    // Act
    const result = await AuthService.refreshToken();

    // Assert
    expect(result).toBeNull();
  });

  it('Should return null if session is not found in cache', async () => {
    // Act
    const result = await AuthService.refreshToken('test');

    // Assert
    expect(result).toBeNull();
  });

  it('Should return a new token if session is found in cache', async () => {
    // Arrange
    const session = faker.random.alphaNumeric(32);
    await TipiCache.set(session, 'test');

    // Act
    const result = await AuthService.refreshToken(session);

    // Assert
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('token');
    expect(result?.token).not.toBe(session);
  });

  it('Should put expiration in 6 seconds for old session', async () => {
    // Arrange
    const session = faker.random.alphaNumeric(32);
    await TipiCache.set(session, '1');

    // Act
    const result = await AuthService.refreshToken(session);
    const expiration = await TipiCache.ttl(session);

    // Assert
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('token');
    expect(result?.token).not.toBe(session);
    expect(expiration).toMatchObject({ EX: 6 });
  });
});

describe('Test: me', () => {
  it('Should return null if userId is not provided', async () => {
    // Act
    const result = await AuthService.me(ctx);

    // Assert
    expect(result).toBeNull();
  });

  it('Should return null if user does not exist', async () => {
    // Act
    const result = await AuthService.me({ ...ctx, session: { userId: 1 } });

    // Assert
    expect(result).toBeNull();
  });

  it('Should return user if user exists', async () => {
    // Arrange
    const email = faker.internet.email();
    const user = await createUser(email);

    // Act
    const result = await AuthService.me({ ...ctx, session: { userId: user.id } });

    // Assert
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('username');
  });
});
