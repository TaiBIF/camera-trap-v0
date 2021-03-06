const errors = require('../../errors');

// eslint-disable-next-line
module.exports = async ({ data, req, res, db }) => {
  // allowed: project, funder, projectStartDate, earliestRecordTimestamp, ...
  let sortKey = data.sort_key || 'projectStartDate';
  sortKey = `project_metadata.${sortKey}`;

  // let pm = db.collection(Project.definition.name);
  const cu = db.collection('CtpUser');
  // TODO: remove data.userId part from following line

  if (!req.session.user_info) {
    return res(new errors.Http403('使用者未登入'));
  }
  const { userId } = req.session.user_info;

  const sorts = {};
  sorts[sortKey] = 1;

  // @todo naming change! project => title
  const aggregateQuery = [
    { $match: { userId } },
    { $unwind: '$project_roles' },
    { $group: { _id: '$project_roles.projectId' } },
    {
      $lookup: {
        from: 'Project',
        localField: '_id',
        foreignField: 'projectId',
        as: 'project_metadata',
      },
    },
    { $unwind: '$project_metadata' },
    {
      $project: {
        _id: false,
        // eslint-disable-next-line
        project_metadata: 1,
      },
    },
    {
      $sort: sorts,
    },
  ];

  let rows;
  try {
    rows = await cu.aggregate(aggregateQuery).toArray();
  } catch (error) {
    return res(error);
  }

  let members;
  try {
    members = await cu
      .aggregate([
        {
          $unwind: '$project_roles',
        },
        {
          $match: {
            'project_roles.projectId': {
              $in: rows.map(r => r.project_metadata.projectId),
            },
          },
        },
        {
          $group: {
            _id: '$project_roles.projectId',
            members: {
              $addToSet: '$userId',
            },
          },
        },
      ])
      .toArray();
  } catch (error) {
    return res(error);
  }

  const membersMap = new Map(members.map(m => [m._id, m]));

  rows = rows.map(row => {
    const tmpMembers = membersMap.get(row.project_metadata._id);
    return {
      ...row,
      members: tmpMembers ? tmpMembers.members : [],
    };
  });

  res(null, rows);
};
