'use strict';

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source];
    const result = schema.safeParse(data);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu không hợp lệ',
          details: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
        },
      });
    }
    req.validated = result.data;
    next();
  };
}

module.exports = { validate };