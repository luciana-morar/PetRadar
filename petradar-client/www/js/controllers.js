angular.module('starter.controllers', [])

  // AppCtrl (pe <body>): status retea, contor nesincronizate, toast, logout.
  // Scope-urile ecranelor mostenesc de aici: net, auth, logout, leave
  .controller('AppCtrl', function($scope, $state, $ionicHistory, $ionicLoading, NetworkService,
                                  AuthService, SessionService, PetRepository) {
    $scope.net = NetworkService;
    $scope.auth = AuthService;
    $scope.logout = SessionService.logout;

    function countPending() { $scope.pendingCount = PetRepository.pendingCount(); }
    countPending();
    $scope.$on('pets:changed', countPending);
    $scope.$on('$stateChangeSuccess', countPending);         // dupa schimbarea utilizatorului

    $scope.$on('toast', function(e, text) {
      $ionicLoading.show({ template: text, noBackdrop: true, duration: 2500 });
    });

    // intoarce-te de unde ai venit (sau la lista, daca nu exista istoric)
    $scope.leave = function() {
      if ($ionicHistory.backView()) { $ionicHistory.goBack(); } else { $state.go('pets'); }
    };
  })

  .controller('LoginCtrl', function($scope, $state, $ionicHistory, AuthService, SocketService, PetRepository) {
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

  // Formular: adaugare / editare
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
