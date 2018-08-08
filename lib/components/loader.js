/* jshint node: true */
'use strict';

var Q = require('q'),
    debug = {
        shepherd: require('debug')('zigbee-shepherd')
    };

var Device = require('../model/device'),
    Endpoint = require('../model/endpoint');

var loader = {};

loader.reloadSingleDev = function (shepherd, devRec, callback) {
    var dev = shepherd._devbox.get(devRec.id);

    if (dev && isSameDevice(dev, devRec)) {
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
            return function(){
                if (devRec.nwkAddr !== 0) {  // coordinator
                    return loader.reloadSingleDev(shepherd, devRec).then(function (id) {
                        recoveredIds.push(id);
                    }).fail(function (err) {
                        recoveredIds.push(null);
                        debug.shepherd("Unable to load device record due to %s", err)
                    })
                }
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
    var deferred = Q.defer();

    loader.reloadDevs(shepherd).then(function (devIds) {
        loader.syncDevs(shepherd, function () {
            deferred.resolve();  // whether sync or not, return success
        });
    }).fail(function (err) {
        deferred.reject(err);
    }).done();

    return deferred.promise.nodeify(callback);
};

loader.syncDevs = function (shepherd, callback) {
    var deferred = Q.defer(),
        idsNotInBox = [];

    Q.ninvoke(shepherd._devbox, 'findFromDb', {}).then(function (devRecs) {
        devRecs.forEach(function (devRec) {
            if (!shepherd._devbox.get(devRec.id))
                idsNotInBox.push(devRec.id);
        });

        if (idsNotInBox.length) {
            var ops = devRecs.length;
            idsNotInBox.forEach(function (id) {
                setImmediate(function () {
                    shepherd._devbox.remove(id, function () {
                        ops -= 1;
                        if (ops === 0)
                            deferred.resolve();
                    });
                });
            });
        } else {
            deferred.resolve();
        }
    }).fail(function (err) {
        deferred.reject(err);
    }).done();

    return deferred.promise.nodeify(callback);
};

function isSameDevice(dev, devRec) {
    return (dev.getIeeeAddr() === devRec.ieeeAddr) ? true : false;
}

module.exports = loader;