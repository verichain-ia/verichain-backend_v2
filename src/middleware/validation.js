const Joi = require('joi');

const validateCertificate = (req, res, next) => {
  const schema = Joi.object({
    student_name: Joi.string().required(),
    student_email: Joi.string().email().required(),
    course_name: Joi.string().required()
  });

  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  next();
};

module.exports = { validateCertificate };