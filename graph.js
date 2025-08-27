const svg = d3.select("#graph");
const container = svg.append("g");
const width = +svg.attr("width");
const height = +svg.attr("height");

const zoom = d3.zoom()
  .scaleExtent([0.1, 4])
  .on("zoom", (event) => container.attr("transform", event.transform));
svg.call(zoom);

let selectedNodeId = null;
let allNodes = [];
let allLinks = [];
let nodeElements, linkElements, labelElements;
let simulation;

fetch('flashcards.json')
  .then(res => res.json())
  .then(flashcards => {
    const subtopics = [...new Set(flashcards.map(card => card.subtopic || "default"))];
    const color = d3.scaleOrdinal(d3.schemeCategory10).domain(subtopics);

    // Build legend
    const legend = d3.select("#legend");
    subtopics.forEach(subtopic => {
      legend.append("div").attr("class", "legend-item")
        .html(`<div class="legend-color" style="background:${color(subtopic)}"></div> ${subtopic}`);
    });

    // Populate filter dropdown
    const dropdown = d3.select("#subtopic-filter");
    subtopics.forEach(sub => {
      dropdown.append("option").attr("value", sub).text(sub);
    });

    dropdown.on("change", () => {
      const selected = dropdown.node().value;
      updateVisibility(selected);
    });

    allNodes = flashcards.map(card => ({
      id: card.id,
      question: card.question,
      answer: card.answer,
      subtopic: card.subtopic || "default"
    }));

    allLinks = flashcards.flatMap(card =>
      card.links.map(targetId => ({ source: card.id, target: targetId }))
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
      .attr("r", d => {
        if (/00000$/.test(d.id)) return 30; //top-level
        if (/0000$/.test(d.id)) return 22;  // second level
        if (/000$/.test(d.id)) return 15;   // third level
        if (/00$/.test(d.id)) return 10;    // fourth level
        if (/0$/.test(d.id)) return 8;      // fifth level
        return 5;                           // leaf node
      })
      .attr("fill", d => color(d.subtopic))
      .attr("class", "node")
      .call(drag(simulation))
      .on("click", (event, d) => {
        event.stopPropagation();
        selectedNodeId = d.id;
        nodeElements.classed("highlighted", nd => nd.id === d.id);
        document.getElementById("qa-display").innerHTML = `
          <h3>${d.question}</h3>
          <p>${d.answer}</p>
        `;
        MathJax.typesetPromise();
      });

    labelElements = container.append("g")
      .selectAll("text")
      .data(allNodes)
      .join("text")
      .text(d => d.question)
      .attr("class", "label");

    svg.on("click", () => {
      selectedNodeId = null;
      nodeElements.classed("highlighted", false);
      document.getElementById("qa-display").innerHTML = `
        <p>Click on a node to see its contents.</p>
      `;
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

    const focalMap = {
      Pharmacology: "Pharmacology",
      Regulation: "Drug Development",
      Infastructure: "Information Commons (IC)",
      "Machine Learning": "Artificial Intelligence"
    };

    function updateVisibility(filterValue) {
      const fv = String(filterValue || "").toLowerCase();
      
      // nodeElements.attr("visibility", d =>
      //   fv === "all" || (d.subtopic || "").toLowerCase() === fv ? "visible" : "hidden"
      // );
      // labelElements.attr("visibility", d =>
      //   fv === "all" || (d.subtopic || "").toLowerCase() === fv ? "visible" : "hidden"
      // );
      // linkElements.attr("visibility", d =>
      //   fv === "all" ||
      // ((d.source.subtopic || "").toLowerCase() === fv &&
      //  (d.target.subtopic || "").toLowerCase() === fv) ? "visible" : "hidden"
      // );

      if (fv === "all") {
        const { w, h } = viewportSize();
        centerOn(w, h, 0.15, 500);
        return;
      }
      
      const focalTerm = focalMap[fv] || focalMap[filterValue];
        if (!focalTerm) return;
      
        const t = String(focalTerm).toLowerCase();
        const match = allNodes.find(d =>
          (d.id && d.id.toLowerCase() === t) ||
          (d.question && d.question.toLowerCase() === t)
        );
        if (!match) return;
      
        // Ensure positions exist before zooming (in case user clicks reset very early)
        if (!Number.isFinite(match.x) || !Number.isFinite(match.y)) {
          requestAnimationFrame(() => updateVisibility(filterValue));
          return;
        }
      
        centerOn(match.x, match.y, 0.4, 750);
    }

    const { w, h } = viewportSize();
    centerOn(w, h, 0.25, 0);
    window.updateVisibility = updateVisibility;
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
    d.id.toLowerCase().includes(term) || d.question.toLowerCase().includes(term)
  );

  if (match) {
    // Highlight node
    selectedNodeId = match.id;
    nodeElements.classed("highlighted", d => d.id === match.id);

    // Show QA panel
    document.getElementById("qa-display").innerHTML = `
      <h3>${match.question}</h3>
      <p>${match.answer}</p>
    `;
    MathJax.typesetPromise();

    // Zoom to it smoothly
    centerOn(match.x, match.y, 1.5, 750);
  } else {
    alert("No matching node found.");
  }
}

function resetView() {
  const selected = d3.select("#subtopic-filter").node().value;
  window.updateVisibility(selected);
}

function viewportSize() {
  const rect = svg.node().getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

function centerOn(x, y, scale = 0.4, duration = 750) {
  const { w, h } = viewportSize();
  const transform = d3.zoomIdentity
    .translate(w / 2 - x * scale - 1, h / 2 - y * scale)
    .scale(scale);
  svg.transition().duration(duration).call(zoom.transform, transform);
}

function updateSuggestions() {
  const term = document.getElementById("node-search").value.toLowerCase();
  const maxSuggestions = 3;
  const matches = allNodes.filter(d =>
    d.id.toLowerCase().includes(term) ||
    d.question.toLowerCase().includes(term)
  ).slice(0, maxSuggestions);

  const suggestionsDiv = document.getElementById("suggestions");
  suggestionsDiv.innerHTML = "";

  if (term && matches.length) {
    const list = document.createElement("ul");
    list.style.listStyle = "none";
    list.style.margin = "0";
    list.style.padding = "0";
    list.style.background = "#fff";
    list.style.border = "1px solid #ccc";
    list.style.position = "absolute";
    list.style.zIndex = "10";
    list.style.width = "80%";

    matches.forEach(match => {
      const item = document.createElement("li");
      item.textContent = `${match.question}`;
      item.style.padding = "8px";
      item.style.cursor = "pointer";
      item.addEventListener("click", () => {
        // document.getElementById("node-search").value = match.id;
        nodeElements.classed("highlighted", d => d.id === match.id);

        // Show QA panel
        document.getElementById("qa-display").innerHTML = `
          <h3>${match.question}</h3>
          <p>${match.answer}</p>
        `;
        MathJax.typesetPromise();
    
        // Zoom to it smoothly
        centerOn(match.x, match.y, 1.5, 750);
        
        suggestionsDiv.innerHTML = "";
      });
      list.appendChild(item);
    });

    suggestionsDiv.appendChild(list);
  }
}


