# PetRadar - PDM 

Aplicația PetRadar este un sistem de monitorizare și gestionare a animalelor de companie.

## Funcționalități principale
- Vizualizarea alertelor (id, nume, specie, descriere, locatie, status, poza)
- Adaugarea unei alerte noi
- Editarea unei alerte
- Stergerea unei alerte
- Filtrarea alertelor dupa status (pierdut / gasit) si specie
## Funcționalități (Ionic 1)
- Vizualizarea alertelor (nume, specie, descriere, locație, status, poză) - ecran master (listă) și ecran detaliu
- Adăugarea, editarea și ștergerea unei alerte
- Date preluate printr-un serviciu REST
- Notificări în timp real prin WebSocket (alertă nouă / modificată / ștearsă)

## Funcționalități (Ionic 2)
- **Autentificare JWT**: tokenul este păstrat în localStorage; dacă utilizatorul este deja autentificat, pagina de login nu se mai deschide; există logout
- **Resurse legate de utilizator**: REST-ul returnează doar alertele utilizatorului autentificat, iar notificările WebSocket se trimit doar proprietarului (conexiunea socket este și ea autentificată cu JWT)
- **Status rețea**: banda din partea de jos arată Online / Offline
- **Online/offline**: în online aplicația folosește întâi serverul; offline (sau dacă serverul nu răspunde) salvează local și marchează alerta „nesincronizat"; aplicația afișează câte modificări nu au ajuns la server
- **Sincronizare automată** a modificărilor locale la revenirea în online
- **Cache local** în localStorage (per utilizator) pentru funcționare offline
- **Paginare** cu infinite scroll
- **Căutare și filtrare** după text și status (pierdut / găsit)

## Rulare
    # server (port 3000)
    cd petradar-server && npm install && node server/server.js

    # client (port 8100)
    cd petradar-client && npm install && bower install && ionic serve

Utilizatori de test: `ana` / `1234` și `ion` / `1234`.