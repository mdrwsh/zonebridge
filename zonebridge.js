// ----- 1. Geocoding -----
async function getCoordinates(place) {
    const url = "https://nominatim.openstreetmap.org/search";
    const params = new URLSearchParams({
        q: place,
        countrycodes: "MY",
        bounded: 1,
        format: "json",
        limit: 1
    });
    const res = await fetch(`${url}?${params.toString()}`, { headers: { "User-Agent": "TestApp" }});
    const data = await res.json();
    if (!data.length) throw new Error(`No results for ${place}`);
    return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
}

// ----- 2. Haversine -----
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const phi1 = lat1*Math.PI/180, phi2 = lat2*Math.PI/180;
    const dphi = (lat2-lat1)*Math.PI/180;
    const dlambda = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dphi/2)**2 + Math.cos(phi1)*Math.cos(phi2)*Math.sin(dlambda/2)**2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

// ----- 3. Dijkstra -----
function dijkstra(graph, start, target, stationList) {
    if (!(start in graph) || !(target in graph)) return [Infinity, []];

    const distances = Object.fromEntries(Object.keys(graph).map(n => [n, Infinity]));
    const previous = {};
    distances[start] = 0;
    const pq = [[0, start]];

    while(pq.length) {
        pq.sort((a,b)=>a[0]-b[0]); // simple priority queue
        const [dist, node] = pq.shift();
        if(node === target) break;

        for (const [neighbor, weightOrig] of Object.entries(graph[node])) {
            let weight = weightOrig;
            if(weight < 0){
                weight = stationList[neighbor]?.application==="Rapid KL Train"? -weight*0.10 : -weight*0.15;
            } else {
                if(weight<300) weight=0;
                weight = weight*3*(1+weight/200);
                if(+node>0 && +neighbor>0 && stationList[node].zone !== stationList[neighbor].zone) weight+=3000;
            }
            const newDist = dist + weight;
            if(newDist < distances[neighbor]) {
                distances[neighbor] = newDist;
                previous[neighbor] = node;
                pq.push([newDist, neighbor]);
            }
        }
    }

    if(distances[target]===Infinity) return [Infinity, []];

    const path = [];
    let node = target;
    while(node in previous) { path.unshift(node); node = previous[node]; }
    path.unshift(start);
    return [distances[target], path];
}

async function findPath(start, target) {
    const [originLat, originLon] = await getCoordinates(start);
    const [targetLat, targetLon] = await getCoordinates(target);

    // Load station list and graph from local cached.json
    const response = await fetch("cached.json", { cache: "no-cache" });
    const [stationList, graph] = await response.json();

    // Add walking nodes
    for(const ID in stationList){
        const [lat, lon] = stationList[ID].coordinate;
        const o = haversine(lat, lon, originLat, originLon);
        const t = haversine(lat, lon, targetLat, targetLon);
        graph["-1"][ID] = o;
        graph["-2"][ID] = t;
        graph[ID]["-1"] = o;
        graph[ID]["-2"] = t;
    }

    const [distance, path] = dijkstra(graph, "-1", "-2", stationList);
    console.log("Distance:", distance);
    console.log("Path:", path);

    // Split by zones
    const finalPath = [];
    let currentZone = null, currentLine = [];
    for(const id of path.slice(1,-1)){
        const zone = stationList[id].zone;
        if(zone !== currentZone){
            if(currentLine.length>1) finalPath.push(currentLine);
            currentLine = [id];
        } else {
            currentLine.push(id);
        }
        currentZone = zone;
    }
    if(currentLine.length>1) finalPath.push(currentLine);

    // Print routes
    result = [];
    let last = "-1";
    finalPath.forEach((line,n)=>{
        const st1 = stationList[line[0]], st2 = stationList[line[line.length-1]];
        result.push({
            application: st1.application,
            zone: st1.zone,
            station1: st1.station,
            station2: st2.station
        });
        console.log(`\n(Walk ${graph[last][line[0]]}m)`);
        console.log(`${n+1}. ${st1.application} -- ${st1.zone}`);
        console.log(`  ${st1.station} ${st1.coordinate}`);
        console.log(`  ${st2.station} ${st2.coordinate}`);
        last = line[line.length-1];
    });
    console.log(`(Walk ${graph[path[path.length-2]][path[path.length-1]]}m)`);
    return result;
};