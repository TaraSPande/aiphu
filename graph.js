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
  .then(flashcards => {
    // Ensure it's an array
    if (!Array.isArray(flashcards)) {
      console.error("Expected array of nodes in data.json");
      return;
    }

    const topics = [...new Set(flashcards.map(card => card.topic || "default"))];
    const color = d3.scaleOrdinal(d3.schemeCategory10).domain(topics);

    allNodes = flashcards.map(card => ({
      id: card.id,
      node: card.node,
      topic: card.topic || "default"
    }));

    allLinks = flashcards.flatMap(card =>
      (card.edges || []).map(targetId => ({ source: card.id, target: targetId }))
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
        document.getElementById("qa-display").innerHTML = `
          <h3>${d.id}. ${d.node}</h3>
        `;
      });

    labelElements = container.append("g")
      .selectAll("text")
      .data(allNodes)
      .join("text")
      .text(d => d.node)
      .attr("class", "label")
      .style("font-size", "12px")
      .style("pointer-events", "none"); // let clicks pass through

    simulation.on("tick", () => {
      linkElements
        .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      nodeElements
        .attr("cx", d => d.x).attr("cy", d => d.y);
      labelElements
        .attr("x", d => d.x + 25).attr("y", d => d.y);
    });
  });

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
