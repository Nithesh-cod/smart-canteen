// ============================================================================
// VALIDATION MIDDLEWARE
// ============================================================================
// Request data validation using Joi
// ============================================================================

const Joi = require('joi');

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

// Student signup validation
const signupSchema = Joi.object({
  name: Joi.string().min(2).max(255).required().messages({
    'string.empty': 'Name is required',
    'string.min': 'Name must be at least 2 characters',
    'any.required': 'Name is required'
  }),
  roll_number: Joi.string().min(3).max(50).required().messages({
    'string.empty': 'Roll number is required',
    'any.required': 'Roll number is required'
  }),
  phone: Joi.string().pattern(/^[0-9]{10}$/).required().messages({
    'string.empty': 'Phone number is required',
    'string.pattern.base': 'Phone number must be 10 digits',
    'any.required': 'Phone number is required'
  }),
  email: Joi.string().email().allow('', null),
  department: Joi.string().max(100).allow('', null)
});

// Login validation
const loginSchema = Joi.object({
  identifier: Joi.string().required().messages({
    'string.empty': 'Roll number or phone is required',
    'any.required': 'Roll number or phone is required'
  })
});

// Profile update validation
const profileUpdateSchema = Joi.object({
  name: Joi.string().min(2).max(255),
  email: Joi.string().email().allow('', null),
  department: Joi.string().max(100).allow('', null),
  profile_image_url: Joi.string().uri().allow('', null)
}).min(1).messages({
  'object.min': 'At least one field is required for update'
});

// Menu item creation validation
const menuItemSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  description: Joi.string().max(500).allow('', null),
  category: Joi.string().valid('starters', 'mains', 'desserts', 'beverages').required(),
  price: Joi.number().positive().precision(2).required(),
  image_url: Joi.string().uri().allow('', null),
  is_vegetarian: Joi.boolean(),
  preparation_time: Joi.number().integer().positive()
});

// Order creation validation
const orderSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      menu_item_id: Joi.number().integer().positive().required(),
      item_name: Joi.string().required(),
      quantity: Joi.number().integer().positive().required(),
      price: Joi.number().positive().required()
    })
  ).min(1).required().messages({
    'array.min': 'At least one item is required'
  }),
  total_amount: Joi.number().positive().precision(2).required(),
  original_amount: Joi.number().positive().precision(2),
  points_used: Joi.number().integer().min(0),
  points_earned: Joi.number().integer().min(0)
});

// Payment verification validation
const paymentVerificationSchema = Joi.object({
  order_id: Joi.number().integer().positive().required(),
  razorpay_order_id: Joi.string().required(),
  razorpay_payment_id: Joi.string().required(),
  razorpay_signature: Joi.string().required()
});

// Favorite validation
const favoriteSchema = Joi.object({
  menu_item_id: Joi.number().integer().positive().required()
});

// Order status update validation
const statusUpdateSchema = Joi.object({
  status: Joi.string().valid('pending', 'preparing', 'ready', 'completed', 'cancelled').required()
});

// Availability toggle validation
const availabilitySchema = Joi.object({
  is_available: Joi.boolean().required()
});

// ============================================================================
// VALIDATION MIDDLEWARE FACTORY
// ============================================================================
/**
 * Create validation middleware for a specific schema
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} property - Request property to validate ('body', 'query', 'params')
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false, // Return all errors, not just the first
      stripUnknown: true // Remove unknown fields
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors
      });
    }

    // Replace request property with validated value (with defaults applied)
    req[property] = value;
    next();
  };
};

// ============================================================================
// SPECIFIC VALIDATION MIDDLEWARES
// ============================================================================

const validateSignup = validate(signupSchema, 'body');
const validateLogin = validate(loginSchema, 'body');
const validateProfileUpdate = validate(profileUpdateSchema, 'body');
const validateMenuItem = validate(menuItemSchema, 'body');
const validateOrder = validate(orderSchema, 'body');
const validatePaymentVerification = validate(paymentVerificationSchema, 'body');
const validateFavorite = validate(favoriteSchema, 'body');
const validateStatusUpdate = validate(statusUpdateSchema, 'body');
const validateAvailability = validate(availabilitySchema, 'body');

// ============================================================================
// ID PARAMETER VALIDATION
// ============================================================================
/**
 * Validate ID parameters (ensure they're positive integers)
 */
const validateIdParam = (paramName = 'id') => {
  return (req, res, next) => {
    const id = parseInt(req.params[paramName]);
    
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid ${paramName}. Must be a positive integer.`
      });
    }

    req.params[paramName] = id;
    next();
  };
};

// ============================================================================
// UUID PARAMETER VALIDATION
// ============================================================================
/**
 * Validate UUID parameters
 */
const validateUuidParam = (paramName = 'id') => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  return (req, res, next) => {
    const uuid = req.params[paramName];
    
    if (!uuidPattern.test(uuid)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid ${paramName}. Must be a valid UUID.`
      });
    }

    next();
  };
};

// ============================================================================
// PAGINATION VALIDATION
// ============================================================================
/**
 * Validate pagination query parameters
 */
const validatePagination = (req, res, next) => {
  const schema = Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0)
  });

  const { error, value } = schema.validate(
    {
      limit: req.query.limit,
      offset: req.query.offset
    },
    { stripUnknown: true }
  );

  if (error) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid pagination parameters',
      errors: error.details.map(d => d.message)
    });
  }

  req.query.limit = value.limit;
  req.query.offset = value.offset;
  next();
};

// ============================================================================
// DATE RANGE VALIDATION
// ============================================================================
/**
 * Validate date range query parameters
 */
const validateDateRange = (req, res, next) => {
  const schema = Joi.object({
    from_date: Joi.date().iso(),
    to_date: Joi.date().iso().min(Joi.ref('from_date')).when('from_date', {
      is: Joi.exist(),
      then: Joi.required(),
      otherwise: Joi.optional()
    })
  });

  const { error, value } = schema.validate(
    {
      from_date: req.query.from_date,
      to_date: req.query.to_date
    },
    { stripUnknown: true }
  );

  if (error) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid date range',
      errors: error.details.map(d => d.message)
    });
  }

  if (value.from_date) req.query.from_date = value.from_date;
  if (value.to_date) req.query.to_date = value.to_date;
  next();
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  validate,
  validateSignup,
  validateLogin,
  validateProfileUpdate,
  validateMenuItem,
  validateOrder,
  validatePaymentVerification,
  validateFavorite,
  validateStatusUpdate,
  validateAvailability,
  validateIdParam,
  validateUuidParam,
  validatePagination,
  validateDateRange
};