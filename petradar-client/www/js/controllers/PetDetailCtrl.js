angular.module('starter.controllers')
  // Detaliu + stergere
  .controller('PetDetailCtrl', function($scope, $stateParams, $ionicPopup, PetRepository, NetworkService) {
    function load() {
      PetRepository.get($stateParams.id).then(function(pet) {
        $scope.pet = pet;
        $scope.notFound = false;
      }, function() {
        $scope.pet = null;
        $scope.notFound = true;
      });
    }
    load();
    $scope.$on('pets:changed', load);

    $scope.remove = function() {
      if (!NetworkService.online) {
        $ionicPopup.alert({ title: 'Offline', template: 'Ștergerea necesită conexiune la internet.' });
        return;
      }
      $ionicPopup.confirm({
        title: 'Confirmare ștergere',
        template: 'Sigur vrei să ștergi alerta „' + $scope.pet.name + '"? Nu o vei mai putea recupera.',
        okText: 'Șterge',
        okType: 'button-assertive',
        cancelText: 'Renunță'
      }).then(function(ok) {
        if (!ok) { return; }
        PetRepository.remove($stateParams.id).then($scope.leave, function() {
          $ionicPopup.alert({ title: 'Eroare', template: 'Alerta nu a putut fi ștearsă. Încearcă din nou.' });
        });
      });
    };
  })
