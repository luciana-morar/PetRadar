angular.module('starter.controllers', [])

  .controller('PetsCtrl', function($scope, PetService) {
    PetService.all().then(function(pets) {
      $scope.pets = pets;
    });

    var socket = io('http://localhost:3000');

    socket.on('pet:created', function(newPet) {
      $scope.$apply(function() {
        $scope.pets.push(newPet);
      });
      alert('Notificare: S-a adăugat ' + newPet.name);
    });

    socket.on('pet:updated', function(updatedPet) {
      $scope.$apply(function() {
        var index = $scope.pets.findIndex(p => p.id === updatedPet.id);
        if (index !== -1) $scope.pets[index] = updatedPet;
      });
      alert('Notificare: S-a actualizat ' + updatedPet.name);
    });
  })

  .controller('PetDetailCtrl', function($scope, $stateParams, PetService) {
    PetService.get($stateParams.id).then(function(pet) {
      $scope.pet = pet;
    });

    var socket = io('http://localhost:3000');

    socket.on('pet:updated', function(updatedPet) {
      if (updatedPet.id == $stateParams.id) {
        $scope.$apply(function() {
          $scope.pet = updatedPet;
        });
      }
    });

  })

  .controller('PetFormCtrl', function($scope, $stateParams, $state, PetService) {
    $scope.isEdit = $stateParams.id !== 'new';

    if ($scope.isEdit) {
      PetService.get($stateParams.id).then(function(pet) {
        $scope.pet = pet;
      });
    } else {
      $scope.pet = {};
    }

    $scope.save = function() {
      if ($scope.isEdit) {
        PetService.update($stateParams.id, $scope.pet).then(function() {
          $state.go('pet-detail', { id: $stateParams.id });
        });
      } else {
        PetService.create($scope.pet).then(function(newPet) {
          $state.go('pet-detail', { id: newPet.id });
        });
      }
    };
  });
