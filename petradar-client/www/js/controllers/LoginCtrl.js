angular.module('starter.controllers').controller('LoginCtrl', function($scope, $state, $ionicHistory, AuthService, SocketService, PetRepository) {
    $scope.form = { username: '', password: '' };

    $scope.login = function() {
      $scope.error = '';
      $scope.loading = true;
      AuthService.login($scope.form.username, $scope.form.password).then(function() {
        $scope.form.password = '';
        SocketService.connect();
        PetRepository.sync();
        $ionicHistory.nextViewOptions({ historyRoot: true, disableBack: true });
        $state.go('pets');
      }, function(response) {
        $scope.error = response.status === 401 ? 'Utilizator sau parolă greșită.' : 'Serverul nu poate fi contactat.';
      }).finally(function() { $scope.loading = false; });
    };
  })
