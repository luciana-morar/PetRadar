angular.module('starter.controllers', [])

  .controller('PetsCtrl', function($scope, PetService) {
    PetService.all().then(function(pets) {
      $scope.pets = pets;
    });

    var socket = io('http://localhost:3000');
    socket.on('connect', function() { console.log("Connected!"); });

    socket.on('pet:created', function(newPet) {
      console.log("Notificare : ", newPet);
      $scope.$apply(function() {
        $scope.pets.push(newPet);
      });

      alert('Notificare: Un animal nou a fost adaugat! (' + newPet.name + ')');
    });
  })

  .controller('PetDetailCtrl', function($scope, $stateParams, PetService) {
    PetService.get($stateParams.id).then(function(pet) {
      $scope.pet = pet;
    });
  });
