const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const turf = require('@turf/turf');
const fs = require('fs');
const Papa = require('papaparse');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

// Load your GeoJSON data
const geojsonData = JSON.parse(fs.readFileSync('./maps/enclosures.geojson', 'utf8'));

// Find the T-Rex enclosure polygon
const tRexEnclosure = geojsonData.features.find(feature => feature.properties.Enclosure === 'Tyrannosaurus Rex');

// Load the dinosaur data from the CSV file
const file = fs.readFileSync('./dino_info/t_rex.csv', 'utf8');
const dinosaurs = Papa.parse(file, { header: true }).data;

// Initialize the locations, bearings, and paths for each dinosaur
let locations = dinosaurs.map(() => null);
let bearings = dinosaurs.map(() => Math.random() * 360);  // Initialize bearings with random values
let paths = dinosaurs.map(() => []);
let speed = 0.03;
let counter = 0;

io.on('connection', (socket) => {
  console.log('New client connected');

  // Emit 'gps update' event with mock data every 3 seconds
  setInterval(() => {
    counter++;
    for (let i = 0; i < dinosaurs.length; i++) {
      if (!locations[i]) {
        let point;
        do {
          // Generate a new random point within the enclosure for each dinosaur
          point = turf.randomPoint(1, {bbox: turf.bbox(tRexEnclosure)}).features[0];
        } while (!turf.booleanPointInPolygon(point, tRexEnclosure));
        locations[i] = { lat: point.geometry.coordinates[1], lng: point.geometry.coordinates[0] };
      } else {
        let point = turf.point([locations[i].lng, locations[i].lat]);
        let destination;
        do {
          // Calculate a new location for each dinosaur
          let bearingChange = Math.random() * 20 - 10;  // Random value between -10 and 10
          bearings[i] = (bearings[i] + bearingChange + 360) % 360;  // Ensure the result is between 0 and 360
          let distance = Math.random() * speed;  // Random distance
          destination = turf.destination(point, distance, bearings[i]);
        } while (!turf.booleanPointInPolygon(destination, tRexEnclosure));

        // Update the dinosaur's location
        let newLocation = { lat: destination.geometry.coordinates[1], lng: destination.geometry.coordinates[0] };
        locations[i] = newLocation;

        // Update the dinosaur's path
        if (counter % 5 === 0) {  // If counter is a multiple of 5
            paths[i].push({...newLocation});  // Create a new object
            if (paths[i].length > 50) {  // Limit the path to the last 50 locations
            paths[i].shift();
            }
        }

        // Add the dinosaur data and path to the location
        locations[i].dinosaur = dinosaurs[i];
        locations[i].path = paths[i];
    }

    }

    console.log(locations);
    // Emit 'gps update' event with the locations of all dinosaurs
    socket.emit('gps update', locations);
  }, 3000);  // Emit new location every 3 seconds

  socket.on('disconnect', () => console.log('Client disconnected'));
});

server.listen(3000, () => console.log('Listening on port 3000'));