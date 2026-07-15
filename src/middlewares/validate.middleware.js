// Factory: pass a Zod schema, returns Express middleware that validates req.body
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(422).json({
        message: 'Please fix the highlighted fields and try again',
        errors: result.error.issues.map((e) => ({
          field: e.path.join('.') || 'body',
          message: e.message,
        })),
      });
    }
    req.body = result.data; // replace with parsed + coerced values
    next();
  };
}

// Validate req.query instead of req.body
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(422).json({
        message: 'Please fix the highlighted query parameters and try again',
        errors: result.error.issues.map((e) => ({
          field: e.path.join('.') || 'query',
          message: e.message,
        })),
      });
    }
    req.validatedQuery = result.data;
    next();
  };
}
