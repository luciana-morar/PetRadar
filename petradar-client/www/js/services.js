angular.module('starter.services', [])
  .constant('API', { url: 'http://localhost:3000' })

  // localStorage cu JSON (try/catch, ca sa nu pice aplicatia daca e blocat)
  .factory('Store', function($window) {
    return {
      get: function(key, fallback) { try { return JSON.parse($window.localStorage.getItem(key)) || fallback; } catch (e) { return fallback; } },
      set: function(key, value) { try { $window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} },
      remove: function(key) { try { $window.localStorage.removeItem(key); } catch (e) {} }
    };
  })

  // Offline = browserul nu are retea SAU serverul nu raspunde.
  // Interceptorul apeleaza markOnline()/markOffline(); cat timp suntem offline, pingam serverul la 4 secunde.
  .factory('NetworkService', function($window, $rootScope, $interval, $http, API) {
    var nav = $window.navigator;
    var state = { online: nav.onLine !== false };
    var probe;

    function ping() {
      if (nav.onLine !== false) { $http.get(API.url + '/api/ping', { timeout: 3000 }).catch(angular.noop); }
    }

    function set(value) {
      $rootScope.$evalAsync(function() {
        if (state.online === value) { return; }
        state.online = value;
        if (value) { $interval.cancel(probe); } else { probe = $interval(ping, 4000); }
        $rootScope.$broadcast(value ? 'network:online' : 'network:offline');
      });
    }

    state.markOnline = function() { if (nav.onLine !== false) { set(true); } };
    state.markOffline = function() { set(false); };

    $window.addEventListener('online', function() { set(true); });
    $window.addEventListener('offline', function() { set(false); });

    if (!state.online) { probe = $interval(ping, 4000); }
    return state;
  })

  // Tokenul JWT in localStorage: {token, id, username}
  .factory('AuthService', function($http, Store, API) {
    function field(name, fallback) { var auth = Store.get('auth', null); return auth ? auth[name] : fallback; }

    return {
      login: function(username, password) {
        return $http.post(API.url + '/api/login', { username: username, password: password }).then(function(response) {
          Store.set('auth', response.data);
          return response.data;
        });
      },
      token: function() { return field('token', null); },
      userId: function() { return field('id', null); },
      username: function() { return field('username', ''); },
      isLoggedIn: function() { return !!field('token', null); },
      clear: function() { Store.remove('auth'); }
    };
  })

  // Pune tokenul pe fiecare cerere, raporteaza starea retelei si delogheaza la 401
  // ($injector, ca sa nu depindem de servicii care la randul lor folosesc $http)
  .factory('AuthInterceptor', function($q, $injector) {
    return {
      request: function(config) {
        var token = $injector.get('AuthService').token();
        if (token) { config.headers.Authorization = 'Bearer ' + token; }
        return config;
      },
      response: function(response) {
        $injector.get('NetworkService').markOnline();
        return response;
      },
      responseError: function(response) {
        var network = $injector.get('NetworkService');
        if (response.status <= 0) { network.markOffline(); } else { network.markOnline(); }   // <= 0: nu am ajuns la server
        if (response.status === 401 && response.config.url.indexOf('/api/login') === -1) {
          $injector.get('SessionService').logout();
        }
        return $q.reject(response);
      }
    };
  })

  // Logout complet: token, socket, ecranele din cache ale utilizatorului vechi
  .factory('SessionService', function($state, $ionicHistory, AuthService, SocketService) {
    return {
      logout: function() {
        AuthService.clear();
        SocketService.disconnect();
        $ionicHistory.clearCache();
        $ionicHistory.clearHistory();
        $state.go('login');
      }
    };
  })

  // Toata logica online/offline + apelurile REST.
  //
  // Date locale, separate pe utilizator (localStorage):
  //   pets_cache  lista de animale. Cele create/modificate offline au _pending: true;
  //               cele create offline au id "local-<timp>" (se trimit cu POST, restul cu PUT)
  //   id_aliases  {"local-123": idRealDupaSincronizare}
  .factory('PetRepository', function($q, $http, $rootScope, NetworkService, AuthService, Store, API) {

    function key(name) { return name + '_' + (AuthService.userId() || 'anon'); }
    function cache() { return Store.get(key('pets_cache'), []); }
    function pending() { return cache().filter(function(p) { return p._pending; }); }
    function find(list, id) { return list.filter(function(p) { return String(p.id) === String(id); })[0]; }
    function resolve(id) { return Store.get(key('id_aliases'), {})[id] || id; }
    function isLocal(id) { return String(id).indexOf('local-') === 0; }
    function offline(response) { return response.status <= 0; }
    function changed() { $rootScope.$broadcast('pets:changed'); }
    function newest(a, b) { return String(b.id).replace('local-', '') - String(a.id).replace('local-', ''); }

    function clean(pet) {                              // ce trimitem la server
      var body = angular.copy(pet);
      delete body.id; delete body.userId; delete body._pending;
      return body;
    }

    function matches(pet, filter) {
      var q = (filter.search || '').toLowerCase().trim();
      if (filter.status && pet.status !== filter.status) { return false; }
      return !q || [pet.name, pet.species, pet.location, pet.description].join(' ').toLowerCase().indexOf(q) !== -1;
    }

    // fara raspuns in 8s, cererea pica (=> offline)
    function api(method, path, data, params) {
      return $http({ method: method, url: API.url + '/api/pets' + path, data: data, params: params, timeout: 8000 })
        .then(function(response) { return response.data; });
    }

    // ----- cache -----
    // pune un animal in cache; nu suprascrie o modificare locala netrimisa (decat cu force)
    function saveToCache(pet, force) {
      var list = cache();
      var old = find(list, pet.id);
      if (old && old._pending && !force) { return old; }
      if (old) { list[list.indexOf(old)] = pet; } else { list.push(pet); }
      Store.set(key('pets_cache'), list);
      return pet;
    }

    function dropFromCache(id) {
      Store.set(key('pets_cache'), cache().filter(function(p) { return String(p.id) !== String(id); }));
    }

    // scriere locala (offline / server inaccesibil): fara id = animal nou, altfel modificarea unuia existent
    function saveLocal(id, body) {
      var old = id && find(cache(), id);
      if (id && !old) { return $q.reject({ status: 404 }); }
      var pet = angular.extend({}, old, body, { id: old ? old.id : 'local-' + Date.now(), _pending: true });
      saveToCache(pet, true);
      changed();
      return pet;
    }

    // ----- citire (offline: aceeasi forma de raspuns, dar din cache) -----
    function page(pageNumber, limit, filter) {
      var from = (pageNumber - 1) * limit;

      function local() {
        var list = cache().filter(function(p) { return matches(p, filter); }).sort(newest);
        return { items: list.slice(from, from + limit), hasMore: from + limit < list.length };
      }

      if (!NetworkService.online) { return $q.when(local()); }

      var params = { page: pageNumber, limit: limit, search: filter.search || undefined, status: filter.status || undefined };
      return api('GET', '', null, params).then(function(result) {
        result.items = result.items.map(function(p) { return saveToCache(p); });
        if (pageNumber === 1) {                        // + cele create offline, inca netrimise
          var created = cache().filter(function(p) { return isLocal(p.id) && matches(p, filter); }).sort(newest);
          result.items = created.concat(result.items);
        }
        return result;
      }, function(response) {
        return offline(response) ? local() : $q.reject(response);
      });
    }

    function get(id) {
      id = resolve(id);
      function cached() {
        var pet = find(cache(), id);
        return pet ? $q.when(pet) : $q.reject({ status: 404 });
      }
      if (!NetworkService.online || isLocal(id)) { return cached(); }
      return api('GET', '/' + id).then(saveToCache, function(response) {
        return offline(response) ? cached() : $q.reject(response);
      });
    }

    // ----- scriere: online -> server; offline sau eroare de retea -> local, de trimis mai tarziu -----
    function save(id, pet) {                           // id gol = creare
      id = resolve(id);
      var body = clean(pet);
      if (!NetworkService.online || isLocal(id)) { return $q.when(saveLocal(id, body)); }
      return api(id ? 'PUT' : 'POST', id ? '/' + id : '', body).then(function(saved) {
        saveToCache(saved, true);
        changed();
        return saved;
      }, function(response) {
        return offline(response) ? saveLocal(id, body) : $q.reject(response);
      });
    }

    function remove(id) {                              // stergerea cere conexiune
      id = resolve(id);
      if (!NetworkService.online) { return $q.reject({ status: 0, offline: true }); }
      return api('DELETE', '/' + id).then(function(removed) {
        dropFromCache(id);
        changed();
        return removed;
      });
    }

    // ----- sincronizare: trimite modificarile netrimise, una pe rand -----
    var syncing;

    function sync() {
      if (syncing) { return syncing; }
      var todo = pending();
      if (!NetworkService.online || !todo.length) { return $q.when(); }

      syncing = todo.reduce(function(chain, item) {
        return chain.then(function() {
          var pet = find(cache(), item.id);            // versiunea cea mai noua
          if (!pet) { return; }
          var create = isLocal(pet.id);

          return (create ? api('POST', '', clean(pet)) : api('PUT', '/' + pet.id, clean(pet))).then(function(saved) {
            if (create) {
              dropFromCache(pet.id);                   // scoatem "local-..." si eventualul duplicat adus de socket
              dropFromCache(saved.id);
              var aliases = Store.get(key('id_aliases'), {});
              aliases[pet.id] = saved.id;
              Store.set(key('id_aliases'), aliases);
            }
            saveToCache(saved, true);
          }, function(response) {
            if (offline(response) || response.status === 401) { return $q.reject(response); }   // reincercam mai tarziu
            pet._pending = false;                      // eroare permanenta (ex. 404): renuntam la modificare
            saveToCache(pet, true);
          });
        });
      }, $q.when()).catch(angular.noop).finally(function() { syncing = null; changed(); });

      return syncing;
    }

    // ----- evenimente WebSocket -----
    function applyRemote(event, pet) {
      if (event === 'pet:deleted') { dropFromCache(pet.id); } else { saveToCache(pet); }
      changed();
    }

    return {
      page: page,
      get: get,
      create: function(pet) { return save(null, pet); },
      update: save,
      remove: remove,
      sync: sync,
      applyRemote: applyRemote,
      pendingCount: function() { return pending().length; }
    };
  })

  // O singura conexiune socket, cu token, creata dupa login
  .factory('SocketService', function($rootScope, API, AuthService, PetRepository) {
    var socket;
    var messages = { 'pet:created': 'Alertă nouă: ', 'pet:updated': 'Alertă actualizată: ', 'pet:deleted': 'Alertă ștearsă: ' };

    return {
      connect: function() {
        if (socket || !AuthService.isLoggedIn() || typeof io === 'undefined') { return; }
        socket = io(API.url, { auth: { token: AuthService.token() } });

        Object.keys(messages).forEach(function(event) {
          socket.on(event, function(pet) {
            $rootScope.$apply(function() {
              PetRepository.applyRemote(event, pet);
              $rootScope.$broadcast('toast', messages[event] + pet.name);
            });
          });
        });
      },
      disconnect: function() {
        if (socket) { socket.disconnect(); socket = null; }
      }
    };
  });
