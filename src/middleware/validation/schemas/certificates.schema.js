const Joi = require('joi');

const certificateSchemas = {
  create: Joi.object({
    student_name: Joi.string()
      .trim()
      .min(2)
      .max(255)
      .pattern(/^[a-zA-ZÀ-ÿ\s'-]+$/)
      .required()
      .messages({
        'string.pattern.base': 'Student name can only contain letters, spaces, hyphens and apostrophes',
        'string.min': 'Student name must be at least 2 characters long',
        'string.max': 'Student name cannot exceed 255 characters',
        'any.required': 'Student name is required'
      }),

    student_email: Joi.string()
      .email()
      .lowercase()
      .trim()
      .allow(null, '')
      .optional()
      .messages({
        'string.email': 'Please provide a valid student email'
      }),

    student_id: Joi.string()
      .trim()
      .max(50)
      .alphanum()
      .allow(null, '')
      .optional()
      .messages({
        'string.alphanum': 'Student ID can only contain letters and numbers',
        'string.max': 'Student ID cannot exceed 50 characters'
      }),

    course_name: Joi.string()
      .trim()
      .min(2)
      .max(255)
      .required()
      .messages({
        'string.min': 'Course name must be at least 2 characters long',
        'string.max': 'Course name cannot exceed 255 characters',
        'any.required': 'Course name is required'
      }),

    course_code: Joi.string()
      .trim()
      .max(50)
      .uppercase()
      .allow(null, '')
      .optional()
      .messages({
        'string.max': 'Course code cannot exceed 50 characters'
      }),

    instructor_name: Joi.string()
      .trim()
      .min(2)
      .max(255)
      .pattern(/^[a-zA-ZÀ-ÿ\s'-]+$/)
      .allow(null, '')
      .optional()
      .messages({
        'string.pattern.base': 'Instructor name can only contain letters, spaces, hyphens and apostrophes',
        'string.min': 'Instructor name must be at least 2 characters long'
      }),

    issue_date: Joi.date()
      .iso()
      .max('now')
      .optional()
      .messages({
        'date.max': 'Issue date cannot be in the future'
      }),

    graduation_date: Joi.date()
      .iso()
      .allow(null)
      .optional()
      .messages({
        'date.base': 'Graduation date must be a valid date'
      }),

    grade: Joi.string()
      .trim()
      .max(10)
      .pattern(/^[A-F][+-]?$|^[0-9]+(\.[0-9]+)?$/)
      .allow(null, '')
      .optional()
      .messages({
        'string.pattern.base': 'Grade must be a letter grade (A-F) or numeric value',
        'string.max': 'Grade cannot exceed 10 characters'
      }),

    credits: Joi.number()
      .integer()
      .min(0)
      .max(100)
      .allow(null)
      .optional()
      .messages({
        'number.min': 'Credits must be a positive number',
        'number.max': 'Credits cannot exceed 100',
        'number.integer': 'Credits must be a whole number'
      }),

    metadata: Joi.object()
      .optional()
      .default({})
  }),

  update: Joi.object({
    student_name: Joi.string()
      .trim()
      .min(2)
      .max(255)
      .pattern(/^[a-zA-ZÀ-ÿ\s'-]+$/)
      .optional(),

    student_email: Joi.string()
      .email()
      .lowercase()
      .trim()
      .allow(null, '')
      .optional(),

    course_name: Joi.string()
      .trim()
      .min(2)
      .max(255)
      .optional(),

    grade: Joi.string()
      .trim()
      .max(10)
      .pattern(/^[A-F][+-]?$|^[0-9]+(\.[0-9]+)?$/)
      .allow(null, '')
      .optional(),

    credits: Joi.number()
      .integer()
      .min(0)
      .max(100)
      .allow(null)
      .optional(),

    metadata: Joi.object()
      .optional()
  }).min(1).messages({
    'object.min': 'At least one field must be provided for update'
  }),

  query: Joi.object({
    page: Joi.number()
      .integer()
      .min(1)
      .default(1),

    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(20),

    status: Joi.string()
      .valid('pending', 'confirmed', 'failed')
      .optional(),

    organization_id: Joi.string()
      .uuid()
      .optional(),

    search: Joi.string()
      .trim()
      .max(100)
      .optional(),

    from_date: Joi.date()
      .iso()
      .optional(),

    to_date: Joi.date()
      .iso()
      .optional(),

    sort_by: Joi.string()
      .valid('created_at', 'issue_date', 'student_name', 'course_name', 'blockchain_status')
      .default('created_at'),

    sort_order: Joi.string()
      .valid('asc', 'desc')
      .default('desc')
  }),

  batchRegister: Joi.object({
    certificate_ids: Joi.array()
      .items(Joi.string().max(20))
      .min(1)
      .max(10)
      .required()
      .messages({
        'array.min': 'At least one certificate ID is required',
        'array.max': 'Maximum 10 certificates can be registered at once',
        'any.required': 'Certificate IDs array is required'
      })
  })
};

module.exports = certificateSchemas;