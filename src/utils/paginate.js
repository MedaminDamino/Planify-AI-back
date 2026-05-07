/**
 * paginate(model, filter, options)
 *
 * Runs countDocuments + find with skip/limit/sort in parallel.
 * Returns { data, total, page, pages, count }.
 *
 * @param {import('mongoose').Model} model
 * @param {object}  filter   - Mongoose query filter (already scoped to userId)
 * @param {object}  options
 * @param {number}  options.page    - Current page (1-based)
 * @param {number}  options.limit   - Items per page
 * @param {object}  options.sort    - Mongoose sort object  e.g. { createdAt: -1 }
 * @param {object}  [options.select] - Optional field projection
 */
export const paginate = async (model, filter, { page, limit, sort, select } = {}) => {
  const _page  = Math.max(1, parseInt(page)  || 1);
  const _limit = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const skip   = (_page - 1) * _limit;

  const [total, data] = await Promise.all([
    model.countDocuments(filter),
    model.find(filter).sort(sort || { createdAt: -1 }).skip(skip).limit(_limit).select(select || ''),
  ]);

  return {
    data,
    total,
    count: data.length,
    page: _page,
    pages: Math.ceil(total / _limit),
  };
};
