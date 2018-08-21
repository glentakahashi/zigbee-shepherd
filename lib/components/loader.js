/* jshint node: true */
'use strict';

var Q = require('q'),
    Device = require('../model/device'),
    debug = {
        shepherd: require('debug')('zigbee-shepherd')
    };

var loader = {};

loader.reloadSingleDev = function (shepherd, devRec, callback) {
    var dev = shepherd._devbox.get(devRec.id);

    if (dev && dev.getIeeeAddr() === devRec.ieeeAddr) {
        return Q(null).nodeify(callback);
    } else if (dev) {
        devRec.id = null;        // give new id to devRec
    }

    var recoveredDev = new Device(devRec);

    recoveredDev._recoverFromRecord(devRec, shepherd);
    return shepherd._registerDev(recoveredDev, callback);    // return (err, id)
};

loader.reloadDevs = function (shepherd, callback) {
    var recoveredIds = [];

    return Q.ninvoke(shepherd._devbox, 'findFromDb', {}).then(function (devRecs) {
        var all = devRecs.map(function (devRec) {
            if (devRec.nwkAddr !== 0) {  // coordinator
                return loader.reloadSingleDev(shepherd, devRec).then(function (id) {
                    recoveredIds.push(id);
                }).fail(function (err) {
                    recoveredIds.push(null);
                    debug.shepherd("Unable to load device record due to %s", err)
                })
            }
        });

        return Q.all(all)
    }).then(function(){
        return recoveredIds
    }, function (err) {
        debug.shepherd("Unable to load device records due to %s", err)
        deferred.reject(err);
    }).nodeify(callback);
};

loader.reload = function (shepherd, callback) {
    return loader.reloadDevs(shepherd).then(function (devIds) {
        return loader.syncDevs(shepherd);
    }).nodeify(callback)
};

loader.syncDevs = function (shepherd, callback) {
    return Q.ninvoke(shepherd._devbox, 'findFromDb', {})
        .then(function (devRecs) {
            idsNotInBox = [];

            devRecs.forEach(function (devRec) {
                if (!shepherd._devbox.get(devRec.id))
                    idsNotInBox.push(devRec.id);
            });

            if (idsNotInBox.length) {
                return Q.all(idsNotInBox.map(function (id) {
                    return Q.ninvoke(shepherd._devbox, "remove", id)
                }))
            }
        }).nodeify(callback);
};

module.exports = loader;