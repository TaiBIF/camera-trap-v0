module.exports = function(CameraLocationDataLock) {
  // location locked by someone
  CameraLocationDataLock.remoteMethod('locationLocked', {
    http: { path: '/locked', verb: 'post' },
    // accepts: { arg: 'data', type: 'string', http: { source: 'body' } },
    accepts: [
      { arg: 'data', type: 'object', http: { source: 'body' } },
      { arg: 'req', type: 'object', http: { source: 'req' } },
    ],
    returns: { arg: 'ret', type: 'object' },
  });

  CameraLocationDataLock.locationLocked = function(data, req, callback) {
    CameraLocationDataLock.getDataSource().connector.connect((err, db) => {
      const {
        projectId,
        site,
        subSite,
        cameraLocation,
        fullCameraLocationMd5,
      } = data;

      const toMatch = {};

      if (site) {
        toMatch['cameraLocations.site'] = site;
      }

      if (subSite) {
        toMatch['cameraLocations.subSite'] = subSite;
      }

      if (cameraLocation) {
        toMatch['cameraLocations.cameraLocation'] = subSite;
      }

      if (fullCameraLocationMd5) {
        toMatch[
          'cameraLocations.fullCameraLocationMd5'
        ] = fullCameraLocationMd5;
      }

      if (projectId) {
        toMatch.projectId = projectId;
      } else {
        return callback(new Error('請輸入 projectId'));
      }

      const mdl = db.collection('Project');
      const aggregateQuery = [
        {
          $match: toMatch,
        },
        {
          $unwind: '$cameraLocations',
        },
        {
          $lookup: {
            from: 'CameraLocationDataLock',
            localField: 'cameraLocations.fullCameraLocationMd5',
            foreignField: 'fullCameraLocationMd5',
            as: 'cameraLocationDataLock',
          },
        },
        {
          $unwind: '$cameraLocationDataLock',
        },
        /* 20181111 removed as Thomas asked
        {
          "$match": {
            "cameraLocationDataLock.locked": true
          }
        }, */
        {
          $project: {
            _id: false,
            cameraLocationDataLock: {
              projectId: '$projectId',
              // projectTitle: '$projectTitle',
              site: '$cameraLocations.site',
              subSite: '$cameraLocations.subSite',
              cameraLocation: '$cameraLocations.cameraLocation',
              fullCameraLocationMd5: '$cameraLocations.fullCameraLocationMd5',
              locked: '$cameraLocationDataLock.locked',
              // eslint-disable-next-line
              locked_by: '$cameraLocationDataLock.locked_by',
              // eslint-disable-next-line
              locked_on: '$cameraLocationDataLock.locked_on',
            },
          },
        },
        {
          $lookup: {
            from: 'CtpUser',
            localField: 'cameraLocationDataLock.locked_by',
            foreignField: '_id',
            as: 'lockedByUser',
          },
        },
        {
          $unwind: '$lockedByUser',
        },
        {
          $project: {
            _id: false,
            cameraLocationDataLock: {
              projectId: '$cameraLocationDataLock.projectId',
              // projectTitle: '$cameraLocationDataLock.projectTitle',
              site: '$cameraLocationDataLock.site',
              subSite: '$cameraLocationDataLock.subSite',
              cameraLocation: '$cameraLocationDataLock.cameraLocation',
              fullCameraLocationMd5:
                '$cameraLocationDataLock.fullCameraLocationMd5',
              locked: '$cameraLocationDataLock.locked',
              // eslint-disable-next-line
              locked_by: {
                userId: '$cameraLocationDataLock.locked_by',
                name: '$lockedByUser.name',
                email: '$lockedByUser.email',
              },
              // eslint-disable-next-line
              locked_on: '$cameraLocationDataLock.locked_on',
            },
          },
        },
      ];

      mdl.aggregate(aggregateQuery).toArray((_err, locationMonthAbnormal) => {
        if (_err) {
          callback(_err);
        } else {
          callback(null, locationMonthAbnormal);
        }
      });
    });
  };
};
