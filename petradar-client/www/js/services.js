angular.module('starter.services', [])

  // Pe un telefon real inlocuieste "localhost" cu IP-ul calculatorului
  .constant('API', { url: 'http://localhost:3000' })

  // ---------------------------------------------------------------
  // Store: localStorage cu JSON (si try/catch, ca sa nu pice aplicatia)
  // ---------------------------------------------------------------
  .factory('Store', function($window) {
    return {
      get: function(key, fallback) {
        try {
          var v = JSON.parse($window.localStorage.getItem(key));
          return v === null || v === undefined ? fallback : v;
        } catch (e) {
          return fallback;
        }
      },
      set: function(key, value) {
        try { $window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
      },
      remove: function(key) {
        try { $window.localStorage.removeItem(key); } catch (e) {}
      }
    };
  })

  // ---------------------------------------------------------------
  // NetworkService: online/offline
  //  - offline = browserul nu are retea SAU serverul nu raspunde
  //  - interceptorul apeleaza markOffline()/markOnline() dupa fiecare cerere
  //  - cat timp suntem offline, verificam periodic serverul (/api/ping)
  // ---------------------------------------------------------------
  .factory('NetworkService', function($window, $rootScope, $interval, $injector, API) {
    var state = { online: $window.navigator.onLine !== false };
    var probe = null;

    function startProbe() {
      if (probe) { return; }
      probe = $interval(function() {
        if ($window.navigator.onLine === false) { return; }   // asteptam evenimentul "online"
        $injector.get('$http').get(API.url + '/api/ping', { timeout: 3000 }).catch(function() {});
      }, 4000);
    }

    function set(value) {
      $rootScope.$evalAsync(function() {
        if (state.online === value) { return; }
        state.online = value;
        if (value && probe) { $interval.cancel(probe); probe = null; }
        if (!value) { startProbe(); }
        $rootScope.$broadcast(value ? 'network:online' : 'network:offline');
      });
    }
    state.markOnline = function() {
      if (!state.online && $window.navigator.onLine !== false) { set(true); }
    };
    state.markOffline = function() { if (state.online) { set(false); } };

    $window.addEventListener('online', function() { set(true); });
    $window.addEventListener('offline', function() { set(false); });

    if (!state.online) { startProbe(); }
    return state;
  })

  // ---------------------------------------------------------------
  // AuthService: tokenul JWT in localStorage
  // (foloseste $injector pentru $http, ca sa evitam dependenta circulara cu interceptorul)
  // ---------------------------------------------------------------
  .factory('AuthService', function($injector, Store, API) {
    var KEY = 'auth';

    return {
      login: function(username, password) {
        return $injector.get('$http')
          .post(API.url + '/api/login', { username: username, password: password })
          .then(function(response) {
            Store.set(KEY, response.data);          // {token, id, username}
            return response.data;
          });
      },
      get: function() { return Store.get(KEY, null); },
      token: function() { var a = this.get(); return a ? a.token : null; },
      userId: function() { var a = this.get(); return a ? a.id : null; },
      username: function() { var a = this.get(); return a ? a.username : ''; },
      isLoggedIn: function() { return !!this.token(); },
      clear: function() { Store.remove(KEY); }
    };
  })

  // ---------------------------------------------------------------
  // Interceptor: pune tokenul, raporteaza starea retelei, delogheaza la 401
  // ---------------------------------------------------------------
  .factory('AuthInterceptor', function($q, $injector) {
    return {
      request: function(config) {
        var token = $injector.get('AuthService').token();
        if (token) { config.headers.Authorization = 'Bearer ' + token; }
        return config;
      },
      response: function(response) {
        $injector.get('NetworkService').markOnline();            // serverul a raspuns
        return response;
      },
      responseError: function(response) {
        var network = $injector.get('NetworkService');
        if (response.status <= 0) { network.markOffline(); }     // nu am ajuns la server
        else { network.markOnline(); }

        if (response.status === 401 && response.config.url.indexOf('/api/login') === -1) {
          $injector.get('SessionService').logout();
        }
        return $q.reject(response);
      }
    };
  })

  // ---------------------------------------------------------------
  // SessionService: logout complet (token, socket, ecrane din cache)
  // ---------------------------------------------------------------
  .factory('SessionService', function($injector) {
    return {
      logout: function() {
        $injector.get('AuthService').clear();
        $injector.get('SocketService').disconnect();
        var $ionicHistory = $injector.get('$ionicHistory');
        $ionicHistory.clearCache();               // sterge ecranele "cached" ale utilizatorului vechi
        $ionicHistory.clearHistory();
        $injector.get('$state').go('login');
      }
    };
  })

  // ---------------------------------------------------------------
  // PetService: doar apelurile REST. Fara raspuns in 8s, cererea pica (=> offline)
  // ---------------------------------------------------------------
  .factory('PetService', function($http, API) {
    var URL = API.url + '/api/pets';
    var opts = { timeout: 8000 };
    function data(response) { return response.data; }

    return {
      page: function(params) { return $http.get(URL, { params: params, timeout: 8000 }).then(data); },
      get: function(id) { return $http.get(URL + '/' + id, opts).then(data); },
      create: function(pet) { return $http.post(URL, pet, opts).then(data); },
      update: function(id, pet) { return $http.put(URL + '/' + id, pet, opts).then(data); },
      remove: function(id) { return $http.delete(URL + '/' + id, opts).then(data); }
    };
  })

  // ---------------------------------------------------------------
  // PetRepository: toata logica online/offline
  //
  // Date locale (separate pe utilizator, in localStorage):
  //   pets_cache   lista de animale; cele create offline au id "local-<timp>" si _pending: true
  //   pending_ops  coada [{type: 'create'|'update', id}] de trimis la server
  //   id_aliases   {"local-123": idRealDupaSincronizare}
  // ---------------------------------------------------------------
  .factory('PetRepository', function($q, $rootScope, PetService, NetworkService, AuthService, Store) {

    // ----- stocare -----
    function read(name, fallback) { return Store.get(name + '_' + (AuthService.userId() || 'anon'), fallback); }
    function write(name, value) { Store.set(name + '_' + (AuthService.userId() || 'anon'), value); }
    function changed() { $rootScope.$broadcast('pets:changed'); }

    function isLocal(id) { return String(id).indexOf('local-') === 0; }
    function offline(response) { return !response || response.status <= 0; }
    function find(list, id) { return list.filter(function(p) { return String(p.id) === String(id); })[0]; }
    function resolve(id) { return read('id_aliases', {})[id] || id; }
    function time(pet) { return parseInt(String(pet.id).replace('local-', ''), 10); }
    function newest(a, b) { return time(b) - time(a); }

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

    // ----- cache -----
    // pune un animal in cache; nu suprascrie o modificare locala netrimisa (decat cu force)
    function saveToCache(pet, force) {
      var cache = read('pets_cache', []);
      var old = find(cache, pet.id);
      if (old && old._pending && !force) { return old; }
      if (old) { cache[cache.indexOf(old)] = pet; } else { cache.push(pet); }
      write('pets_cache', cache);
      return pet;
    }

    function dropFromCache(id) {
      write('pets_cache', read('pets_cache', []).filter(function(p) { return String(p.id) !== String(id); }));
    }

    // ----- coada -----
    function saveOps(ops) {
      write('pending_ops', ops);
      $rootScope.$broadcast('pending:changed', ops.length);
    }

    function enqueue(type, id) {
      var ops = read('pending_ops', []);
      var exists = ops.some(function(o) { return o.type === type && String(o.id) === String(id); });
      if (!exists) { ops.push({ type: type, id: id }); saveOps(ops); }
    }

    function dequeue(type, id) {
      saveOps(read('pending_ops', []).filter(function(o) {
        return !(o.type === type && String(o.id) === String(id));
      }));
    }

    // ----- scrieri locale (offline sau server inaccesibil) -----
    function localCreate(body) {
      var pet = angular.extend({}, body, { id: 'local-' + Date.now(), _pending: true });
      saveToCache(pet);
      enqueue('create', pet.id);
      changed();
      return pet;
    }

    function localUpdate(id, body) {
      var old = find(read('pets_cache', []), id);
      if (!old) { return $q.reject({ status: 404 }); }
      var pet = angular.extend({}, old, body, { id: old.id, _pending: true });
      saveToCache(pet, true);
      if (!isLocal(id)) { enqueue('update', id); }     // cel creat offline are deja "create" in coada
      changed();
      return pet;
    }

    // ----- citire -----
    function localPage(page, limit, filter) {          // offline: aceeasi forma, dar din cache
      var list = read('pets_cache', []).filter(function(p) { return matches(p, filter); }).sort(newest);
      return { items: list.slice((page - 1) * limit, page * limit), total: list.length, hasMore: page * limit < list.length };
    }

    function page(pageNumber, limit, filter) {
      filter = filter || {};
      if (!NetworkService.online) { return $q.when(localPage(pageNumber, limit, filter)); }

      var params = { page: pageNumber, limit: limit };
      if (filter.search) { params.search = filter.search; }
      if (filter.status) { params.status = filter.status; }

      return PetService.page(params).then(function(result) {
        result.items = result.items.map(function(p) { return saveToCache(p); });
        if (pageNumber === 1) {                        // + cele create offline, inca netrimise
          var local = read('pets_cache', []).filter(function(p) { return isLocal(p.id) && matches(p, filter); });
          result.items = local.sort(newest).concat(result.items);
        }
        return result;
      }, function(response) {
        return offline(response) ? localPage(pageNumber, limit, filter) : $q.reject(response);
      });
    }

    function get(id) {
      id = resolve(id);
      function fromCache() {
        var pet = find(read('pets_cache', []), id);
        return pet ? $q.when(pet) : $q.reject({ status: 404 });
      }
      if (!NetworkService.online || isLocal(id)) { return fromCache(); }
      return PetService.get(id).then(function(pet) { return saveToCache(pet); }, function(response) {
        return offline(response) ? fromCache() : $q.reject(response);
      });
    }

    // ----- scriere: online -> server; offline sau eroare de retea -> local + coada -----
    function create(pet) {
      var body = clean(pet);
      if (!NetworkService.online) { return $q.when(localCreate(body)); }
      return PetService.create(body).then(function(saved) {
        saveToCache(saved, true);
        changed();
        return saved;
      }, function(response) {
        return offline(response) ? localCreate(body) : $q.reject(response);
      });
    }

    function update(id, pet) {
      id = resolve(id);
      var body = clean(pet);
      if (!NetworkService.online || isLocal(id)) { return $q.when(localUpdate(id, body)); }
      return PetService.update(id, body).then(function(saved) {
        saveToCache(saved, true);
        dequeue('update', id);                         // versiunea de pe server e cea buna
        changed();
        return saved;
      }, function(response) {
        return offline(response) ? localUpdate(id, body) : $q.reject(response);
      });
    }

    function remove(id) {                              // stergerea cere conexiune
      id = resolve(id);
      if (!NetworkService.online) { return $q.reject({ status: 0, offline: true }); }
      return PetService.remove(id).then(function(removed) {
        dropFromCache(id);
        changed();
        return removed;
      });
    }

    // ----- sincronizare: trimite coada, o operatie pe rand -----
    var syncing = null;

    function sendOp(op) {
      var pet = find(read('pets_cache', []), op.id);
      if (!pet) { return dequeue(op.type, op.id); }

      var request = op.type === 'create'
        ? PetService.create(clean(pet))
        : PetService.update(op.id, clean(pet));

      return request.then(function(saved) {
        if (op.type === 'create') {
          dropFromCache(op.id);                        // scoatem "local-..." si eventualul duplicat adus de socket
          dropFromCache(saved.id);
          var aliases = read('id_aliases', {});
          aliases[op.id] = saved.id;
          write('id_aliases', aliases);
        }
        saveToCache(saved, true);
        dequeue(op.type, op.id);
      }, function(response) {
        if (offline(response) || response.status === 401) { return $q.reject(response); }   // reincercam mai tarziu
        pet._pending = false;                          // eroare permanenta (ex. 404): renuntam la operatie
        saveToCache(pet, true);
        dequeue(op.type, op.id);
      });
    }

    function sync() {
      if (syncing) { return syncing; }
      var ops = read('pending_ops', []);
      if (!NetworkService.online || !ops.length) { return $q.when(); }

      syncing = ops.reduce(function(chain, op) {
        return chain.then(function() { return sendOp(op); });
      }, $q.when())
        .catch(function() {})                          // ce n-a plecat ramane in coada
        .finally(function() { syncing = null; changed(); });

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
      create: create,
      update: update,
      remove: remove,
      sync: sync,
      applyRemote: applyRemote,
      pendingCount: function() { return read('pending_ops', []).length; }
    };
  })

  // ---------------------------------------------------------------
  // SocketService: o singura conexiune, cu token, creata dupa login
  // ---------------------------------------------------------------
  .factory('SocketService', function($rootScope, API, AuthService, PetRepository) {
    var socket = null;
    var messages = {
      'pet:created': 'Alertă nouă: ',
      'pet:updated': 'Alertă actualizată: ',
      'pet:deleted': 'Alertă ștearsă: '
    };

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
