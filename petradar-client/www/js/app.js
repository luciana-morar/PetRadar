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

  // Pornirea aplicatiei: paza de rute, socket, sincronizare
  .run(function($rootScope, $state, $interval, AuthService, SocketService, PetRepository, NetworkService) {

    // Paza de rute (vezi `resolve` din stari)
    $rootScope.$on('$stateChangeError', function(event, toState, toParams, fromState, fromParams, error) {
      if (error === 'AUTH_REQUIRED') { $state.go('login'); }
      if (error === 'ALREADY_LOGGED_IN') { $state.go('pets'); }
    });

    // Autentificat deja la pornire: conectam socketul si trimitem coada
    if (AuthService.isLoggedIn()) {
      SocketService.connect();
      PetRepository.sync();
    }

    // La revenirea online: trimitem coada si reconectam socketul
    $rootScope.$on('network:online', function() {
      if (AuthService.isLoggedIn()) {
        SocketService.connect();
        PetRepository.sync();
      }
    });

    // Plasa de siguranta: reincercam periodic cat timp exista modificari netrimise
    $interval(function() {
      if (AuthService.isLoggedIn() && NetworkService.online && PetRepository.pendingCount() > 0) {
        PetRepository.sync();
      }
    }, 15000);
  })

  .config(function($stateProvider, $urlRouterProvider, $httpProvider) {

    $httpProvider.interceptors.push('AuthInterceptor');

    // "pazile": daca promisiunea e respinsa, starea nu se deschide
    function requireAuth($q, AuthService) {
      return AuthService.isLoggedIn() ? true : $q.reject('AUTH_REQUIRED');
    }
    function guestOnly($q, AuthService) {
      return AuthService.isLoggedIn() ? $q.reject('ALREADY_LOGGED_IN') : true;
    }

    $stateProvider
      .state('login', {
        url: '/login',
        templateUrl: 'templates/login.html',
        controller: 'LoginCtrl',
        resolve: { guest: guestOnly }
      })
      .state('pets', {
        url: '/pets',
        templateUrl: 'templates/pets.html',
        controller: 'PetsCtrl',
        resolve: { auth: requireAuth }
      })
      .state('pet-detail', {
        url: '/pets/:id',
        templateUrl: 'templates/pet-detail.html',
        controller: 'PetDetailCtrl',
        resolve: { auth: requireAuth }
      })
      .state('pet-form', {
        url: '/pet-form/:id',
        templateUrl: 'templates/pet-form.html',
        controller: 'PetFormCtrl',
        resolve: { auth: requireAuth }
      });

    // ruta implicita depinde de autentificare
    $urlRouterProvider.otherwise(function($injector) {
      return $injector.get('AuthService').isLoggedIn() ? '/pets' : '/login';
    });
  });;
