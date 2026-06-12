/**
 * Route Input Validation Middleware
 * Validates request body parameters for API endpoints
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Validation rule interface
 */
interface ValidationRule {
  type?: 'string' | 'number' | 'boolean' | 'url' | 'email';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  enum?: string[];
}

/**
 * Validation schema interface
 */
interface ValidationSchema {
  [field: string]: ValidationRule;
}

/**
 * Validation error response
 */
interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Validate a single field against a rule
 */
function validateField(value: unknown, rule: ValidationRule, fieldName: string): ValidationError | null {
  // Check required fields
  if (rule.required && (value === undefined || value === null || value === '')) {
    return {
      field: fieldName,
      message: `${fieldName} is required`,
      value
    };
  }

  // Skip validation if field is not required and value is empty
  if (!rule.required && (value === undefined || value === null || value === '')) {
    return null;
  }

  // Type validation
  if (rule.type) {
    switch (rule.type) {
      case 'string':
        if (typeof value !== 'string') {
          return {
            field: fieldName,
            message: `${fieldName} must be a string`,
            value
          };
        }
        break;

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return {
            field: fieldName,
            message: `${fieldName} must be a number`,
            value
          };
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return {
            field: fieldName,
            message: `${fieldName} must be a boolean`,
            value
          };
        }
        break;

      case 'url':
        if (typeof value !== 'string') {
          return {
            field: fieldName,
            message: `${fieldName} must be a string`,
            value
          };
        }
        try {
          new URL(value);
        } catch {
          return {
            field: fieldName,
            message: `${fieldName} must be a valid URL`,
            value
          };
        }
        break;

      case 'email':
        if (typeof value !== 'string') {
          return {
            field: fieldName,
            message: `${fieldName} must be a string`,
            value
          };
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          return {
            field: fieldName,
            message: `${fieldName} must be a valid email address`,
            value
          };
        }
        break;
    }
  }

  // String-specific validations
  if (typeof value === 'string') {
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      return {
        field: fieldName,
        message: `${fieldName} must be at least ${rule.minLength} characters long`,
        value
      };
    }

    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      return {
        field: fieldName,
        message: `${fieldName} must be at most ${rule.maxLength} characters long`,
        value
      };
    }

    if (rule.pattern && !rule.pattern.test(value)) {
      return {
        field: fieldName,
        message: `${fieldName} format is invalid`,
        value
      };
    }

    if (rule.enum && !rule.enum.includes(value)) {
      return {
        field: fieldName,
        message: `${fieldName} must be one of: ${rule.enum.join(', ')}`,
        value
      };
    }
  }

  return null;
}

/**
 * Validate request body against schema
 */
export function validateBody(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: ValidationError[] = [];

    // Validate each field in the schema
    for (const [field, rule] of Object.entries(schema)) {
      const value = req.body[field];
      const error = validateField(value, rule, field);
      if (error) {
        errors.push(error);
      }
    }

    // Return validation errors if any
    if (errors.length > 0) {
      res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
      return;
    }

    next();
  };
}

/**
 * Common validation schemas
 */
export const validationSchemas = {
  // Verify endpoint schema
  verify: {
    url: { type: 'url', required: true },
    name: { type: 'string', required: false, maxLength: 200 }
  } as ValidationSchema,

  // Job creation schema
  job: {
    url: { type: 'url', required: true },
    name: { type: 'string', required: false, maxLength: 200 }
  } as ValidationSchema,

  // Project creation schema
  project: {
    name: { type: 'string', required: true, minLength: 1, maxLength: 100, pattern: /^[a-zA-Z0-9_-]+$/ }
  } as ValidationSchema,

  // API key creation schema
  apiKey: {
    name: { type: 'string', required: true, minLength: 1, maxLength: 100 }
  } as ValidationSchema
};