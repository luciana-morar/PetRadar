angular.module('starter.controllers')
  .controller('PetFormCtrl', function($scope, $stateParams, PetRepository) {
    $scope.isEdit = $stateParams.id !== 'new';
    $scope.pet = { status: 'pierdut' };

    if ($scope.isEdit) {
      PetRepository.get($stateParams.id).then(function(pet) { $scope.pet = angular.copy(pet); });
    }

    // dupa salvare ne intoarcem de unde am venit: lista la adaugare, detaliul la editare
    $scope.save = function() {
      if (!$scope.pet.name) { return; }
      $scope.saving = true;
      ($scope.isEdit ? PetRepository.update($stateParams.id, $scope.pet) : PetRepository.create($scope.pet))
        .then($scope.leave)
        .finally(function() { $scope.saving = false; });
    };
  });
