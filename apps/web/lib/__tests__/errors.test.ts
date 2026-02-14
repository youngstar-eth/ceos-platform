import { describe, it, expect } from 'vitest';
import { AppError, Errors } from '@/lib/errors';

describe('AppError', () => {
  it('should serialize to JSON correctly', () => {
    const error = new AppError('TEST_ERROR', 'Test message', 400);
    const json = error.toJSON();

    expect(json).toEqual({
      success: false,
      error: { code: 'TEST_ERROR', message: 'Test message' },
    });
  });

  it('should set name to AppError', () => {
    const error = new AppError('CODE', 'msg', 500);
    expect(error.name).toBe('AppError');
  });

  it('should be instanceof Error', () => {
    const error = new AppError('CODE', 'msg');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });
});

describe('Errors factory', () => {
  it('should create notFound with 404 status', () => {
    const error = Errors.notFound('Agent');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Agent not found');
  });

  it('should create badRequest with 400 status', () => {
    const error = Errors.badRequest('Invalid input');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
  });

  it('should create rateLimited with 429 status', () => {
    const error = Errors.rateLimited();
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('RATE_LIMITED');
  });

  it('should create paymentRequired with 402 status', () => {
    const error = Errors.paymentRequired();
    expect(error.statusCode).toBe(402);
    expect(error.code).toBe('PAYMENT_REQUIRED');
  });

  it('should create unauthorized with 401 status', () => {
    const error = Errors.unauthorized();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('should create forbidden with 403 status', () => {
    const error = Errors.forbidden();
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });

  it('should create conflict with 409 status', () => {
    const error = Errors.conflict('Already exists');
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');
  });

  it('should create validationFailed with 422 status', () => {
    const error = Errors.validationFailed('Bad field');
    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  it('should create internal with 500 status', () => {
    const error = Errors.internal();
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_ERROR');
  });
});
