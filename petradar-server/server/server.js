const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:8100",
        methods: ["GET", "POST"],
        credentials: true
    }
});

let pets = [
    { id: 1, name: "Max", species: "Câine", status: "pierdut", location: "Cluj-Napoca", description: "Labrador, foarte prietenos." },
    { id: 2, name: "Luna", species: "Pisică", status: "găsit", location: "Florești", description: "Pisică neagră, fără zgârzi." },
    { id: 3, name: "Rex", species: "Câine", status: "pierdut", location: "Mănăștur", description: "Ciobănesc german, are zgârdan roșu." }
];

app.get('/api/pets', (req, res) => {
    res.json(pets);
});

app.get('/api/pets/:id', (req, res) => {
    const pet = pets.find(p => p.id === parseInt(req.params.id));
    if (!pet) return res.status(404).json({ error: 'Not found' });
    res.json(pet);
});

app.post('/api/pets', (req, res) => {
    const newPet = { id: pets.length + 1, ...req.body };
    pets.push(newPet);
    io.emit('pet:created', newPet);
    res.status(201).json(newPet);
});

//websocket conexiune
io.on('connection', (socket) => {
    console.log('Un client s-a conectat prin WebSocket:', socket.id);

    socket.on('disconnect', () => {
        console.log('Client deconectat:', socket.id);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});