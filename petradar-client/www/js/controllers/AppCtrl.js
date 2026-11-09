angular.module('starter.controllers')
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
