function cdsUploaderCtrl($scope, $q, Upload, $http) {
  var that = this;
  // Is the uploader loading
  this.loading = false;
  // The Upload Queue
  this.queue = [];
  // Do we have any errors
  this.errors = [];
  // The ongoing uploads
  this.uploading = [];

  // On Component init
  this.$onInit = function() {
    // Add any files in the queue that are not completed
    this.queue = _.reject(that.files, {completed: true});

    // Prepare file request
    this.prepareUpload = function(file) {
      var args = {
        url:  that.cdsDepositCtrl.links.bucket + '/' + file.key,
        method: 'PUT',
        headers: {
          'Content-Type': (file.type || '').indexOf('/') > -1 ? file.type : ''
        },
        data: file
      };
      return args;
    };

    this.prepareDelete = function(url) {
      var args = {
        url:  url,
        method: 'DELETE'  ,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      return args;
    }

    this.uploader = function() {
      var defer = $q.defer();
      var data = [];
      function _chain(upload) {
        var args = that.prepareUpload(upload);
        Upload.http(args)
        .then(
          function success(response) {
            // Update the file with status
            response.data.completed = true;
            response.data.progress = 100;
            that.updateFile(
              response.config.data.key,
              response.data,
              true
            );
            data.push(response.data);
          },
          function error(response) {
            // Throw an error
            defer.reject(response);
          },
          function progress(evt) {
            var progress = parseInt(100.0 * evt.loaded / evt.total, 10);
            that.cdsDepositCtrl.progress = progress;
            // Update the file with status
            that.updateFile(
              evt.config.data.key,
              {
                progress: progress
              }
            );
          }
        )
        .finally(function finish(evt) {
          if (that.queue.length > 0) {
            return _chain(that.queue.shift());
          } else {
            defer.resolve(data);
          }
        });
      }
      _chain(that.queue.shift());
      return defer.promise;
    }

    this.upload = function() {
      if (that.queue.length > 0) {
        // Start loading
        $scope.$emit('cds.deposit.loading.start');
        that.cdsDepositCtrl.loading = true;
        // Start local loading
        that.loading = true;
        that.uploader()
        .then(
          function success(response) {
          },
          function error(response) {
            // Inform the parents
            $scope.$emit('cds.deposit.error', response);
          }
        ).finally(
          function done() {
            // Stop loading
            $scope.$emit('cds.deposit.loading.stop');
            that.cdsDepositCtrl.loading = false;
            // Local loading
            that.loading = false;
          }
        );
      }
    }
  }

  this.findFileIndex = function(files, key) {
    return _.indexOf(
      files,
      _.findWhere(that.files, {key: key})
    );
  }

  this.updateFile = function(key, data, force) {
    var index = this.findFileIndex(that.files, key);
    if (force === true) {
      this.files[index] = angular.copy(data);
      return;
    }

    this.files[index] = angular.merge(
      {},
      this.files[index],
      data || {}
    );
  }

  this.addFiles = function(_files) {
    angular.forEach(_files, function(file, index) {
      // GRRRRRRRRRRR :(
      file.key = file.name;
      // Mark the file as local
      file.local = true;
      // Add the file to the list
      that.files.push(file);
      // Add the file to the queue
      that.queue.push(file);
    });
  };

  this.abort = function() {
    // Abort the upload
  };

  this.remove = function(key) {
    // Find the file index
    var index = this.findFileIndex(that.files, key);

    if (this.files[index].links === undefined) {
      // Remove the file from the list
      that.files.splice(index, 1);
      // Find the file's index in the queue
      var q_index = this.findFileIndex(that.queue, key);
      // remove the file from the queue
      that.queue.splice(q_index, 1);
    } else {
      var args = that.prepareDelete(
        that.files[index].links.version || that.files[index].links.self
      );
      $http(args)
      .then(
        function success() {
          // Remove the file from the list
          that.files.splice(index, 1);
        },
        function error(error) {
          // Inform the parents
          $scope.$emit('cds.deposit.error', response);
        }
      );
    }
  };
}

cdsUploaderCtrl.$inject = ['$scope', '$q', 'Upload', '$http'];

function cdsUploader() {
  return {
    bindings: {
      files: '=',
      filterFiles: '=',
    },
    require: {
      cdsDepositCtrl: '^cdsDeposit'
    },
    controller: cdsUploaderCtrl,
    templateUrl: function($element, $attrs) {
      return $attrs.template;
    }
  }
}

angular.module('cdsDeposit.components')
  .component('cdsUploader', cdsUploader());
