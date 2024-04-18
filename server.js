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
const geojsonData = JSON.parse(fs.readFileSync('./public/maps/enclosures.geojson', 'utf8'));

// Initialize the locations, bearings, and paths for each dinosaur
let locations = [];
let bearings = [];
let paths = [];
let speed = 0.03;
let counter = 0;

// Iterate over each feature in the GeoJSON data
for (let feature of geojsonData.features) {
    // Find the enclosure polygon
    const enclosure = feature.properties.Enclosure;
  
    // Initialize the locations, bearings, and paths for each dinosaur in the current enclosure
    locations[enclosure] = [];
    bearings[enclosure] = [];
    paths[enclosure] = [];
  }
  

io.on('connection', (socket) => {
  console.log('New client connected');

// Emit 'gps update' event with mock data every 3 seconds
setInterval(() => {
    counter++;
    for (let enclosure in locations) {
      // Find the enclosure polygon
      const enclosurePolygon = geojsonData.features.find(feature => feature.properties.Enclosure === enclosure);
  
      // Load the dinosaur data from the CSV file
      const file = fs.readFileSync(`./dino_info/${enclosure}.csv`, 'utf8');
      const dinosaurs = Papa.parse(file, { header: true }).data;
  
      // If the locations for the current enclosure have not been initialized, initialize them
      if (locations[enclosure].length === 0) {
        locations[enclosure] = dinosaurs.map(() => null);
        bearings[enclosure] = dinosaurs.map(() => Math.random() * 360);  // Initialize bearings with random values
        paths[enclosure] = dinosaurs.map(() => []);
      }
  
      for (let i = 0; i < locations[enclosure].length; i++) {
        if (!locations[enclosure][i]) {
          let point;
          do {
            // Generate a new random point within the enclosure for each dinosaur
            point = turf.randomPoint(1, {bbox: turf.bbox(enclosurePolygon)}).features[0];
          } while (!turf.booleanPointInPolygon(point, enclosurePolygon));
          locations[enclosure][i] = { lat: point.geometry.coordinates[1], lng: point.geometry.coordinates[0] };
        } else {
          let point = turf.point([locations[enclosure][i].lng, locations[enclosure][i].lat]);
          let destination;
          do {
            // Calculate a new location for each dinosaur
            let bearingChange = Math.random() * 20 - 10;  // Random value between -10 and 10
            bearings[enclosure][i] = (bearings[enclosure][i] + bearingChange + 360) % 360;  // Ensure the result is between 0 and 360
            let distance = Math.random() * speed;  // Random distance
            destination = turf.destination(point, distance, bearings[enclosure][i]);
          } while (!turf.booleanPointInPolygon(destination, enclosurePolygon));
  
          // Update the dinosaur's location
          let newLocation = { lat: destination.geometry.coordinates[1], lng: destination.geometry.coordinates[0] };
          locations[enclosure][i] = newLocation;
  
          // Update the dinosaur's path
          if (counter % 5 === 0) {  // If counter is a multiple of 5
            paths[enclosure][i].push({...newLocation});  // Create a new object
            if (paths[enclosure][i].length > 50) {  // Limit the path to the last 50 locations
              paths[enclosure][i].shift();
            }
          }
  
          // Add the dinosaur data and path to the location
          locations[enclosure][i].dinosaur = dinosaurs[i];
          locations[enclosure][i].path = paths[enclosure][i];
        }
      }
    }
    console.log(locations)

    // Emit 'gps update' event with the locations of all dinosaurs
    socket.emit('gps update', locations);
  }, 3000);  // Emit new location every 3 seconds
  

socket.on('disconnect', () => console.log('Client disconnected'));
});

server.listen(3000, () => console.log('Listening on port 3000'));