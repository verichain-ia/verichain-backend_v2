// Schemas de validación y tipos
const certificateSchema = {
  id: String,
  student_name: String,
  student_email: String,
  course_name: String,
  issue_date: Date,
  tx_hash: String,
  blockchain_status: String
};

const organizationSchema = {
  id: String,
  name: String,
  email: String,
  api_key: String
};

module.exports = {
  certificateSchema,
  organizationSchema
};