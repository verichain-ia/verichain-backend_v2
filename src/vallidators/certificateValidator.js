const Joi = require('joi');

const certificateSchema = Joi.object({
  title: Joi.string().required().min(3).max(255),
  recipient_name: Joi.string().required().min(2).max(100),
  recipient_email: Joi.string().email().required(),
  issuer_name: Joi.string().required(),
  issue_date: Joi.date().iso().required(),
  expiry_date: Joi.date().iso().allow(null),
  description: Joi.string().max(1000).allow(null, ''),
  metadata: Joi.object().allow(null),
  register_blockchain: Joi.boolean().default(false),
  template_id: Joi.string().uuid().allow(null)
});

const validateCertificate = (data) => {
  return certificateSchema.validate(data, {
    stripUnknown: true,
    abortEarly: false
  });
};

module.exports = {
  validateCertificate,
  certificateSchema
};