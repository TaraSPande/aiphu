const svg = d3.select("#graph");
const container = svg.append("g");
const width = +svg.attr("width");
const height = +svg.attr("height");

const zoom = d3.zoom()
  .scaleExtent([0.1, 4])
  .on("zoom", (event) => container.attr("transform", event.transform));
svg.call(zoom);

function resetView() {
  svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
}

let selectedNodeId = null;
let allNodes = [];
let allLinks = [];
let nodeElements, linkElements, labelElements;
let simulation;

fetch('data.json')
  .then(res => res.json())
  .then(data => {
    const topics = [...new Set(data.map(d => d.topic || "default"))];
    const color = d3.scaleOrdinal(d3.schemeCategory10).domain(topics);

    // Build legend
    const legend = d3.select("#legend");
    topics.forEach(topic => {
      legend.append("div").attr("class", "legend-item")
        .html(`<div class="legend-color" style="background:${color(topic)}"></div> ${topic}`);
    });

    // Populate filter dropdown
    const dropdown = d3.select("#subtopic-filter");
    dropdown.append("option").attr("value", "all").text("All");
    topics.forEach(topic => {
      dropdown.append("option").attr("value", topic).text(topic);
    });

    dropdown.on("change", () => {
      const selected = dropdown.node().value;
      updateVisibility(selected);
    });

    allNodes = data.map(d => ({
      id: d.id,
      node: d.node,
      // answer: `Topic: ${d.topic}`,  // Placeholder
      topic: d.topic || "default"
    }));

    allLinks = data.flatMap(d =>
      (d.edges || []).map(targetId => ({
        source: d.id,
        target: targetId
      }))
    );

    simulation = d3.forceSimulation(allNodes)
      .force("link", d3.forceLink(allLinks).id(d => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));

    linkElements = container.append("g")
      .attr("stroke", "#aaa")
      .selectAll("line")
      .data(allLinks)
      .join("line");

    nodeElements = container.append("g")
      .selectAll("circle")
      .data(allNodes)
      .join("circle")
      .attr("r", 20)
      .attr("fill", d => color(d.topic))
      .attr("class", "node")
      .call(drag(simulation))
      .on("click", (event, d) => {
        event.stopPropagation();
        selectedNodeId = d.id;
        nodeElements.classed("highlighted", nd => nd.id === d.id);
        document.getElementById("node-search").value = d.node;
        // document.getElementById("qa-display").innerHTML = `
        //   <h3>${d.id}. ${d.node}</h3>
        //   <p>${d.answer}</p>
        // `;
        // MathJax.typesetPromise?.();
      });

    labelElements = container.append("g")
      .selectAll("text")
      .data(allNodes)
      .join("text")
      .text(d => d.node)
      .attr("class", "label");

    svg.on("click", () => {
      selectedNodeId = null;
      nodeElements.classed("highlighted", false);
      // document.getElementById("qa-display").innerHTML = `
      //   <p>Click on a node to see its question and answer.</p>
      // `;
      document.getElementById("suggestions").innerHTML = "";
      document.getElementById("node-search").value = "";
    });

    simulation.on("tick", () => {
      linkElements
        .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      nodeElements
        .attr("cx", d => d.x).attr("cy", d => d.y);
      labelElements
        .attr("x", d => d.x + 25).attr("y", d => d.y);
    });

    function updateVisibility(filterValue) {
      nodeElements.attr("visibility", d =>
        filterValue === "all" || d.topic === filterValue ? "visible" : "hidden");
      labelElements.attr("visibility", d =>
        filterValue === "all" || d.topic === filterValue ? "visible" : "hidden");
      linkElements.attr("visibility", d =>
        filterValue === "all" ||
        (d.source.topic === filterValue && d.target.topic === filterValue) ? "visible" : "hidden");
    }
  });

// Drag support
function drag(simulation) {
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  return d3.drag()
    .on("start", dragstarted)
    .on("drag", dragged)
    .on("end", dragended);
}

function searchNode() {
  const term = document.getElementById("node-search").value.toLowerCase();
  if (!term) return;

  // Find first match by ID or question text
  const match = allNodes.find(d =>
    d.id.toLowerCase().includes(term) || d.node.toLowerCase().includes(term)
  );

  if (match) {
    // Highlight node
    selectedNodeId = match.id;
    nodeElements.classed("highlighted", d => d.id === match.id);
    document.getElementById("node-search").value = match.node;

    // Zoom to it smoothly
    const scale = 1.5;
    const transform = d3.zoomIdentity
      .translate(width / 2 - match.x * scale, height / 2 - match.y * scale)
      .scale(scale);

    svg.transition()
      .duration(750)
      .call(zoom.transform, transform);
  } else {
    alert("No matching node found.");
  }
}

function updateSuggestions() {
  const term = document.getElementById("node-search").value.toLowerCase();
  const maxSuggestions = 3;
  const matches = allNodes.filter(d =>
    d.id.toLowerCase().includes(term) || d.node.toLowerCase().includes(term)
  ).slice(0, maxSuggestions);

  const suggestionsDiv = document.getElementById("suggestions");
  suggestionsDiv.innerHTML = "";

  if (term && matches.length) {
    const list = document.createElement("ul");
    Object.assign(list.style, {
      listStyle: "none",
      margin: "0",
      padding: "0",
      background: "#fff",
      border: "1px solid #ccc",
      position: "absolute",
      zIndex: "10",
      width: "100%"
    });

    matches.forEach(match => {
      const item = document.createElement("li");
      item.textContent = `[${match.id}] ${match.node}`;
      Object.assign(item.style, {
        padding: "8px",
        cursor: "pointer"
      });
      item.addEventListener("click", () => {
        document.getElementById("node-search").value = match.id;
        suggestionsDiv.innerHTML = "";
      });
      list.appendChild(item);
    });

    suggestionsDiv.appendChild(list);
  }
}
