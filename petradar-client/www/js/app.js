angular.module('starter', ['ionic', 'starter.controllers', 'starter.services'])
.run(function($ionicPlatform) {
  $ionicPlatform.ready(function() {
    if (window.cordova && window.Keyboard) {
      window.Keyboard.hideKeyboardAccessoryBar(true);
    }

    if (window.StatusBar) {
      StatusBar.styleDefault();
    }
  });
})

  .config(function($stateProvider, $urlRouterProvider) {
    $stateProvider

      .state('pets', {
        url: '/pets',
        templateUrl: 'templates/pets.html',
        controller: 'PetsCtrl'
      })

      .state('pet-detail', {
        url: '/pets/:id',
        templateUrl: 'templates/pet-detail.html',
        controller: 'PetDetailCtrl'
      });

    $urlRouterProvider.otherwise('/pets');
  });
