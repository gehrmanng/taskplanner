/*
 * tasklist.controller.js: GNU GENERAL PUBLIC LICENSE Version 3
 */
(function() {
  "use strict";

  /** ******************************** */
  /** ********* Node modules ********* */
  /** ******************************** */
  var winston = require('winston');
  var json2csv = require('json2csv');
  var fs = require('fs');

  /** ******************************** */
  /** ******* MongoOSE Models ******** */
  /** ******************************** */
  var TaskList = require('../models/tasklist.model');

  /**
   * Task list controller.
   * 
   * @author Gerry Gehrmann
   * @since 0.0.1
   * @module
   * @class
   * @name TaskListController
   * @param {Object} socket - The Socket.IO service
   */
  module.exports = function(socket) {

    /**
     * The service interface
     * 
     * @fieldOf TaskListController#
     * @private
     * @interface
     */
    var service = {
      list: list,
      listShared: listShared,
      save: save,
      saveTasks: saveTasks,
      remove: remove,
      exportTasks: exportTasks,
      addWatcher: addWatcher,
      removeWatcher: removeWatcher
    };

    return service;

    /**
     * List all task lists of the current user.
     * 
     * @memberOf TaskListController#
     * @param {Object} req - The HTTP request
     * @param {Object} res - The HTTP response
     */
    function list(req, res) {
      TaskList.find({
          $or: [{
            owner: req.user._id
          }, {
            watcher: req.user._id
          }]
        },
        function(err, result) {
          if (err) {
            winston.error(err);
            res.status(500).send(err);
            return;
          }

          res.send(result);
        });
    }

    /**
     * List all shared task lists.
     * 
     * @memberOf TaskListController#
     * @param {Object} req - The HTTP request
     * @param {Object} res - The HTTP response
     */
    function listShared(req, res) {
      TaskList.find({
        shareMode: {
          $in: ['r', 'w']
        },
        watcher: {
          $ne: req.user._id
        }
      }).populate('owner').exec(function(err, result) {
        if (err) {
          winston.error(err);
          res.status(500).send(err);
          return;
        }

        res.send(result);
      });
    }

    /**
     * Save a given task list.
     * 
     * @memberOf TaskListController#
     * @param {Object} req - The HTTP request
     * @param {Object} res - The HTTP response
     */
    function save(req, res) {
      var tl = req.body.taskList;

      if (tl._id) {
        TaskList.update({
          _id: tl._id
        }, {
          $set: {
            title: tl.title,
            tasks: tl.tasks,
            shareMode: tl.shareMode,
            watcher: tl.shareMode === 'r' || tl.shareMode === 'w' ? tl.watcher : [],
            updated_at: new Date()
          }
        }, function(err) {
          if (err) {
            winston.error(err);
            res.status(500).send(err);
            return;
          }

          res.sendStatus(200);
        });
      } else {
        tl.owner = req.user._id;
        new TaskList(tl).save(function(err, result) {
          if (err) {
            winston.error(err);
            res.status(500).send(err);
            return;
          }

          res.send(result);
        });
      }
    }

    /**
     * Save the tasks of a specific task list.
     * 
     * @memberOf TaskListController#
     * @param {Object} req - The HTTP request
     * @param {Object} res - The HTTP response
     */
    function saveTasks(req, res) {
      var taskListId = req.body.taskListId;
      var tasks = req.body.tasks;

      TaskList.update({
        _id: taskListId
      }, {
        $set: {
          tasks: tasks,
          updated_at: new Date()
        }
      }, function(err) {
        if (err) {
          winston.error(err);
          res.status(500).send(err);
          return;
        }

        socket.emit('task update', {
          taskListId: taskListId,
          tasks: tasks
        });

        res.sendStatus(200);
      });
    }

    /**
     * Remove a given task list.
     * 
     * @memberOf TaskListController#
     * @param {Object} req - The HTTP request
     * @param {Object} res - The HTTP response
     */
    function remove(req, res) {
      var taskListId = req.query['tl'];

      TaskList.findOne({
        _id: taskListId
      }).remove(function(err) {
        if (err) {
          winston.error(err);
          res.status(500).send(err);
          return;
        }

        res.status(200).send();
      });
    }

    /**
     * Export all tasks of the given task list to CSV.
     * 
     * @memberOf TaskListController#
     * @param {Object} req - The HTTP request
     * @param {Object} res - The HTTP response
     */
    function exportTasks(req, res) {
      var taskListId = req.query['tl'];

      TaskList.findOne({
        _id: taskListId
      }, function(err, result) {
        if (err) {
          winston.error(err);
          res.status(500).send(err);
          return;
        }

        if (result) {
          json2csv({
            data: result.tasks,
            fields: ['uuid', 'title', 'dueDate', 'done'],
            del: ';'
          }, function(err, csv) {
            if (err) {
              winston.error(err);
              res.status(500).send(err);
              return;
            }
            fs.writeFile('file.csv', csv, function(err) {
              if (err) {
                winston.error(err);
                res.status(500).send(err);
                return;
              }

              res.download('file.csv');
            });
          });
        }
      });
    }

    /**
     * Add a watcher to a specific task list.
     * 
     * @memberOf TaskListController#
     * @param {Object} req - The HTTP request
     * @param {Object} res - The HTTP response
     */
    function addWatcher(req, res) {
      var taskListId = req.body.taskListId;

      TaskList.findOne({
        _id: taskListId
      }, function(err, result) {
        if (err) {
          winston.error(err);
          res.status(500).send(err);
          return;
        }

        if (result && result.watcher.indexOf(req.user._id) < 0) {
          result.watcher.push(req.user._id);
          TaskList.update({
            _id: result._id
          }, {
            $set: {
              watcher: result.watcher,
              updated_at: new Date()
            }
          }, function(err) {
            if (err) {
              winston.error(err);
              res.status(500).send(err);
              return;
            }

            res.sendStatus(200);
          });
        } else {
          res.sendStatus(200);
        }
      });
    }

    /**
     * Stop watching a specific task list.
     * 
     * @memberOf TaskListController#
     * @param {Object} req - The HTTP request
     * @param {Object} res - The HTTP response
     */
    function removeWatcher(req, res) {
      var taskListId = req.query['tl'];

      TaskList.update({
        _id: taskListId
      }, {
        $pull: {
          watcher: req.user._id
        }
      }, function(err) {
        if (err) {
          winston.error(err);
          res.status(500).send(err);
          return;
        }

        res.sendStatus(200);
      });
    }
  };
})();