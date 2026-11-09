angular.module('starter.controllers')
  // Lista: paginare (infinite scroll) + cautare + filtru
  .controller('PetsCtrl', function($scope, $q, $timeout, PetRepository, AuthService) {
    var PAGE_SIZE = 10;
    var page = 0;
    var generation = 0;                    // invalideaza raspunsurile intarziate dupa un reset
    var owner = AuthService.userId();
    var firstEnter = true;

    $scope.items = [];
    $scope.hasMore = true;
    $scope.filter = { search: '', status: '' };

    // incarca pagina urmatoare si o adauga la lista
    $scope.loadMore = function() {
      if ($scope.loading) { return; }
      var current = generation;
      $scope.loading = true;

      $timeout(function() {                // pauza de 1s doar ca sa se vada indicatorul de incarcare; poate fi stearsa
        PetRepository.page(page + 1, PAGE_SIZE, $scope.filter).then(function(result) {
          if (current !== generation) { return; }
          $scope.items = $scope.items.concat(result.items);
          page++;
          $scope.hasMore = result.hasMore;
        }).finally(function() {
          if (current === generation) { $scope.loading = false; }
          $scope.$broadcast('scroll.infiniteScrollComplete');
        });
      }, 1000);
    };

    // lista de la zero (cautare/filtru schimbate)
    $scope.reset = function() {
      generation++;
      page = 0;
      $scope.items = [];
      $scope.hasMore = true;
      $scope.loading = false;
      $scope.loadMore();
    };

    // reincarca ce e deja afisat, fara sa pierdem pozitia de scroll.
    // La "pull to refresh" trimitem intai modificarile netrimise (nu si la refresh-ul automat,
    // altfel: sync -> pets:changed -> refresh -> sync -> ...)
    $scope.refresh = function(fromPull) {
      var current = ++generation;
      (fromPull ? PetRepository.sync() : $q.when()).finally(function() {
        PetRepository.page(1, Math.max(page, 1) * PAGE_SIZE, $scope.filter).then(function(result) {
          if (current !== generation) { return; }
          $scope.items = result.items;
          $scope.hasMore = result.hasMore;
          page = Math.max(page, 1);
        }).finally(function() {
          if (fromPull) { $scope.$broadcast('scroll.refreshComplete'); }
        });
      });
    };

    $scope.$on('pets:changed', function() { $scope.refresh(false); });
    $scope.$on('network:online', function() { $scope.refresh(false); });

    // Ionic tine lista in cache cat timp esti pe detaliu/formular si ii "deconecteaza" scope-ul,
    // deci NU primeste evenimentele de mai sus: o reincarcam la fiecare intrare pe ecran.
    // Daca s-a schimbat utilizatorul, o golim complet (si filtrele).
    $scope.$on('$ionicView.enter', function() {
      if (owner !== AuthService.userId()) {
        owner = AuthService.userId();
        $scope.filter = { search: '', status: '' };
        $scope.reset();
      } else if (!firstEnter) {
        $scope.refresh(false);
      }
      firstEnter = false;
    });

    $scope.reset();
  })
