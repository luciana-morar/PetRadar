angular.module('starter', ['ionic', 'starter.controllers', 'starter.services'])

  .run(function($ionicPlatform, $rootScope, $state, $interval, AuthService, SocketService, PetRepository) {
    $ionicPlatform.ready(function() {
      if (window.cordova && window.Keyboard) { window.Keyboard.hideKeyboardAccessoryBar(true); }
      if (window.StatusBar) { StatusBar.styleDefault(); }
    });

    // Paza de rute: resolve-ul de mai jos respinge cu numele starii unde trebuie sa mergem
    $rootScope.$on('$stateChangeError', function(event, to, toParams, from, fromParams, redirect) {
      if (angular.isString(redirect)) { $state.go(redirect); }
    });

    // La pornire si la revenirea online: conectam socketul si trimitem modificarile netrimise
    function start() {
      if (AuthService.isLoggedIn()) {
        SocketService.connect();
        PetRepository.sync();
      }
    }
    start();
    $rootScope.$on('network:online', start);
    $interval(PetRepository.sync, 15000);       // plasa de siguranta (nu face nimic daca nu are ce trimite)
  })

  .config(function($stateProvider, $urlRouterProvider, $httpProvider) {
    $httpProvider.interceptors.push('AuthInterceptor');

    // loggedIn = true: ecranul cere autentificare; false: ecranul e doar pentru nelogati (login)
    function guard(loggedIn) {
      return function($q, AuthService) {
        return AuthService.isLoggedIn() === loggedIn ? true : $q.reject(loggedIn ? 'login' : 'pets');
      };
    }
    var needAuth = { auth: guard(true) };

    $stateProvider
      .state('login', { url: '/login', templateUrl: 'templates/login.html', controller: 'LoginCtrl', resolve: { guest: guard(false) } })
      .state('pets', { url: '/pets', templateUrl: 'templates/pets.html', controller: 'PetsCtrl', resolve: needAuth })
      .state('pet-detail', { url: '/pets/:id', templateUrl: 'templates/pet-detail.html', controller: 'PetDetailCtrl', resolve: needAuth })
      .state('pet-form', { url: '/pet-form/:id', templateUrl: 'templates/pet-form.html', controller: 'PetFormCtrl', resolve: needAuth });

    // ruta implicita depinde de autentificare
    $urlRouterProvider.otherwise(function($injector) {
      return $injector.get('AuthService').isLoggedIn() ? '/pets' : '/login';
    });
  });
