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

// Load all Enclosure Data
const geojsonData = JSON.parse(fs.readFileSync('./public/maps/enclosures.geojson', 'utf8'));

// Load Dinosaur Data for Each Enclosure
const enclosures = {};
geojsonData.features.forEach(feature => {
    const enclosureName = feature.properties.Enclosure;
    const csvFile = `./dino_info/${enclosureName}.csv`;
    const file = fs.readFileSync(csvFile, 'utf8');
    enclosures[enclosureName] = {
      data: Papa.parse(file, { header: true }).data,
      polygon: {
          type: "Polygon",
          coordinates: feature.geometry.coordinates
      },
  };
  
});

// Initialize locations, bearings, and paths for each dinosaur in each enclosure
let locations = {};
let bearings = {};
let paths = {};
let speed = 0.015;
let counter = 0;

io.on('connection', (socket) => {
    console.log('New client connected');

    setInterval(() => {
        counter++;
        Object.keys(enclosures).forEach(enclosureName => {
            if (!locations[enclosureName]) {
                locations[enclosureName] = enclosures[enclosureName].data.map(() => null);
                bearings[enclosureName] = enclosures[enclosureName].data.map(() => Math.random() * 360);
                paths[enclosureName] = enclosures[enclosureName].data.map(() => []);
            }

            for (let i = 0; i < enclosures[enclosureName].data.length; i++) {
                if (!locations[enclosureName][i]) {
                    let point;
                    do {
                        point = turf.randomPoint(1, { bbox: turf.bbox(enclosures[enclosureName].polygon) }).features[0];
                    } while (!turf.booleanPointInPolygon(point, enclosures[enclosureName].polygon));
                    locations[enclosureName][i] = { lat: point.geometry.coordinates[1], lng: point.geometry.coordinates[0] };
                } else {
                    let point = turf.point([locations[enclosureName][i].lng, locations[enclosureName][i].lat]);
                    let destination;
                    do {
                        let bearingChange = Math.random() * 20 - 10;
                        bearings[enclosureName][i] = (bearings[enclosureName][i] + bearingChange + 360) % 360;
                        let distance = Math.random() * speed;
                        destination = turf.destination(point, distance, bearings[enclosureName][i]);
                    } while (!turf.booleanPointInPolygon(destination, enclosures[enclosureName].polygon));

                    let newLocation = { lat: destination.geometry.coordinates[1], lng: destination.geometry.coordinates[0] };
                    locations[enclosureName][i] = newLocation;

                    if (counter % 8 === 0) {
                        paths[enclosureName][i].push({ ...newLocation });
                        if (paths[enclosureName][i].length > 50) {
                            paths[enclosureName][i].shift();
                        }
                    }

                    locations[enclosureName][i].dinosaur = enclosures[enclosureName].data[i];
                    locations[enclosureName][i].path = paths[enclosureName][i];
                }
            }

            // Emit 'gps update' event with the locations of all dinosaurs in this enclosure
            socket.emit('gps update', { enclosure: enclosureName, locations: locations[enclosureName] });
        });

        console.log('Updated dinosaur locations:', locations);

    }, 3000);

    socket.on('disconnect', () => console.log('Client disconnected'));
});

server.listen(3000, () => console.log('Listening on port 3000'));
