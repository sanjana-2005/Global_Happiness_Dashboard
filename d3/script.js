d3.csv("data/2015.csv").then(function(data) {

  // --- Theme toggle initialization ---
  function setDarkMode(enabled) {
    if (enabled) {
      document.body.classList.add('dark-mode');
      d3.select('#dark-toggle').text('☀️').attr('aria-pressed', 'true');
    } else {
      document.body.classList.remove('dark-mode');
      d3.select('#dark-toggle').text('🌙').attr('aria-pressed', 'false');
    }
    try { localStorage.setItem('happiness_dark_mode', enabled ? '1' : '0'); } catch(e) {}

    // Adjust SVG and legend text colors (override inline styles set earlier)
    const svgTextColor = enabled ? '#e6eef8' : '#2c3e50';
    const legendTextColor = enabled ? '#e6eef8' : '#333';
    const axisStroke = enabled ? 'rgba(255,255,255,0.12)' : '#ccc';

    try {
      d3.selectAll('svg text').style('fill', svgTextColor);
      d3.selectAll('.legend text').style('fill', legendTextColor);
      d3.selectAll('svg .axis path, svg .axis line').style('stroke', axisStroke);
      d3.selectAll('svg .grid line').style('stroke', enabled ? 'rgba(255,255,255,0.06)' : '#e0e0e0');

      // Update summary-stats (if present)
      const summary = d3.select('#summary-stats');
      if (!summary.empty()) {
        if (enabled) {
          summary.style('background', 'rgba(6, 12, 22, 0.85)').style('color', '#e6eef8').style('border', '1px solid rgba(255,255,255,0.04)');
          summary.selectAll('h3').style('color', '#e6eef8');
        } else {
          summary.style('background', 'rgba(255, 255, 255, 0.95)').style('color', '#2c3e50').style('border', '1px solid rgba(255, 255, 255, 0.3)');
          summary.selectAll('h3').style('color', '#2c3e50');
        }
      }
    } catch (e) {
      // ignore if d3/svg not ready yet
    }
  }

  // initialize based on saved preference (default: light)
  try {
    const saved = localStorage.getItem('happiness_dark_mode');
    setDarkMode(saved === '1');
  } catch (e) { /* ignore storage errors */ }

  // wire up button (button added in index.html)
  const btn = document.getElementById('dark-toggle');
  if (btn) {
    btn.addEventListener('click', function() {
      const isDark = document.body.classList.contains('dark-mode');
      setDarkMode(!isDark);
    });
  }


  // Convert numeric fields
  data.forEach(d => {
    d['Happiness Score'] = +d['Happiness Score'];
    d['Economy (GDP per Capita)'] = +d['Economy (GDP per Capita)'];
    d['Family'] = +d['Family'];
    d['Health (Life Expectancy)'] = +d['Health (Life Expectancy)'];
    d['Freedom'] = +d['Freedom'];
    d['Trust (Government Corruption)'] = +d['Trust (Government Corruption)'];
  });

  const margin = { top: 20, right: 150, bottom: 50, left: 60 };
  const width = 800 - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;
  const regions = [...new Set(data.map(d => d.Region))];
  const color = d3.scaleOrdinal(d3.schemeCategory10).domain(regions);

  // Create tooltip
  const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  // --- Region visibility and shared legend helpers ---
  const regionsVisible = {};
  regions.forEach(r => regionsVisible[r] = true);

  function updateRegionVisibility() {
    regions.forEach(region => {
      const visible = regionsVisible[region];
      // update circles across charts
      d3.selectAll('circle').filter(d => d && d.Region === region)
        .transition().duration(300).attr('opacity', visible ? 0.8 : 0.06);

      // update bars (bars use [region, value] or have d.Region)
      d3.selectAll('rect').filter(function(d) {
        if (!d) return false;
        if (Array.isArray(d)) return d[0] === region;
        if (d.Region) return d.Region === region;
        return false;
      }).transition().duration(300).attr('opacity', visible ? 0.9 : 0.06);
    });
  }

  function addLegend(svgSelection, x = width + margin.left + 20, y = margin.top) {
    // remove existing legend on this svg if present
    svgSelection.selectAll('.legend').remove();
    const legend = svgSelection.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${x},${y})`)
      .style('font-family', 'Segoe UI, Tahoma, sans-serif');

    const item = legend.selectAll('.legend-item')
      .data(regions)
      .enter().append('g')
      .attr('class', 'legend-item')
      .attr('transform', (d, i) => `translate(0, ${i * 22})`)
      .style('cursor', 'pointer')
      .on('click', function(event, region) {
        regionsVisible[region] = !regionsVisible[region];
        // visual feedback on the legend text
        d3.select(this).select('text').transition().duration(150).style('opacity', regionsVisible[region] ? 1 : 0.4);
        updateRegionVisibility();
      });

    item.append('circle')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', 7)
      .attr('fill', d => color(d))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5);

    item.append('text')
      .attr('x', 14)
      .attr('y', 5)
      .style('font-size', '12px')
      .style('fill', '#333')
      .text(d => d);
  }

  // Global filter state
  let filteredData = data;
  let selectedRegions = regions;
  let selectedCountries = data.map(d => d.Country);

  // Add summary statistics
  function updateSummaryStats() {
    const avgHappiness = d3.mean(filteredData, d => d['Happiness Score']).toFixed(2);
    const maxHappiness = d3.max(filteredData, d => d['Happiness Score']).toFixed(2);
    const minHappiness = d3.min(filteredData, d => d['Happiness Score']).toFixed(2);
    const totalCountries = filteredData.length;

    // Update or create summary cards
    let summaryContainer = d3.select("#summary-stats");
    if (summaryContainer.empty()) {
      summaryContainer = d3.select("body").insert("div", ".container")
        .attr("id", "summary-stats")
        .style("position", "fixed")
        .style("top", "20px")
        .style("right", "20px")
        .style("z-index", "1000")
        .style("background", "rgba(255, 255, 255, 0.95)")
        .style("backdrop-filter", "blur(10px)")
        .style("border-radius", "15px")
        .style("padding", "20px")
        .style("box-shadow", "0 10px 30px rgba(0, 0, 0, 0.2)")
        .style("border", "1px solid rgba(255, 255, 255, 0.3)");
    }

    summaryContainer.html(`
      <h3 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 1.1rem;">📊 Current View</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9rem;">
        <div style="text-align: center; padding: 8px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border-radius: 8px;">
          <div style="font-weight: bold; font-size: 1.2rem;">${avgHappiness}</div>
          <div>Avg Happiness</div>
        </div>
        <div style="text-align: center; padding: 8px; background: linear-gradient(135deg, #4ecdc4, #44a08d); color: white; border-radius: 8px;">
          <div style="font-weight: bold; font-size: 1.2rem;">${totalCountries}</div>
          <div>Countries</div>
        </div>
        <div style="text-align: center; padding: 8px; background: linear-gradient(135deg, #ff6b6b, #ee5a52); color: white; border-radius: 8px;">
          <div style="font-weight: bold; font-size: 1.2rem;">${maxHappiness}</div>
          <div>Max Score</div>
        </div>
        <div style="text-align: center; padding: 8px; background: linear-gradient(135deg, #ffe66d, #ffd93d); color: white; border-radius: 8px;">
          <div style="font-weight: bold; font-size: 1.2rem;">${minHappiness}</div>
          <div>Min Score</div>
        </div>
      </div>
    `);
  }

  // Enhanced tooltip function
  function showTooltip(event, d) {
    // safe formatter
    function fmt(val, digits = 2) {
      if (val == null) return '';
      if (typeof val === 'number' && !isNaN(val)) return val.toFixed(digits);
      return String(val);
    }

    tooltip.transition()
      .duration(200)
      .style("opacity", .9);

    // Build content defensively so histogram/bin objects or custom objects work
    const parts = [];
    if (d.Country) parts.push(`<div style="font-weight: bold; font-size: 1.1rem; margin-bottom: 8px;">${d.Country}</div>`);
    if (d['Happiness Rank'] !== undefined) parts.push(`<div style="margin-bottom: 4px;">🏆 Rank: ${fmt(d['Happiness Rank'], 0)}</div>`);
    if (d['Happiness Score'] !== undefined) parts.push(`<div style="margin-bottom: 4px;">😊 Happiness: ${fmt(d['Happiness Score'])}</div>`);
    if (d['Economy (GDP per Capita)'] !== undefined) parts.push(`<div style="margin-bottom: 4px;">💰 GDP: ${fmt(d['Economy (GDP per Capita)'])}</div>`);
    if (d['Family'] !== undefined) parts.push(`<div style="margin-bottom: 4px;">👨‍👩‍👧‍👦 Family: ${fmt(d['Family'])}</div>`);
    if (d['Health (Life Expectancy)'] !== undefined) parts.push(`<div style="margin-bottom: 4px;">🏥 Health: ${fmt(d['Health (Life Expectancy)'])}</div>`);
    if (d['Freedom'] !== undefined) parts.push(`<div style="margin-bottom: 4px;">🕊 Freedom: ${fmt(d['Freedom'])}</div>`);
    if (d['Trust (Government Corruption)'] !== undefined) parts.push(`<div style="margin-bottom: 4px;">🏛 Trust: ${fmt(d['Trust (Government Corruption)'])}</div>`);
    if (d.Region !== undefined) parts.push(`<div style="color: #7f8c8d; font-size: 0.9rem;">${d.Region}</div>`);

    // If nothing matched, render the raw object prettily
    if (parts.length === 0) {
      try {
        parts.push(`<pre style="white-space: pre-wrap; margin:0;">${JSON.stringify(d, null, 2)}</pre>`);
      } catch (e) {
        parts.push(String(d));
      }
    }

    tooltip.html(parts.join(''))
      .style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY - 10) + "px");
  }

  function hideTooltip() {
    tooltip.transition()
      .duration(200)
      .style("opacity", 0);
  }

  // Highlight country across all charts
  function highlightCountry(countryName) {
    // Reset all highlights
    d3.selectAll("circle, rect, path").classed("highlighted", false);
    d3.selectAll("circle, rect, path").classed("dimmed", false);
    
    // Highlight selected country
    d3.selectAll("circle, rect, path")
      .filter(d => d.Country === countryName)
      .classed("highlighted", true);
    
    // Dim other elements
    d3.selectAll("circle, rect, path")
      .filter(d => d.Country !== countryName)
      .classed("dimmed", true);
    
    // Update summary stats for this country
    const countryData = data.find(d => d.Country === countryName);
    if (countryData) {
      updateSummaryStats([countryData]);
    }
  }

  // Reset highlights
  function resetHighlights() {
    d3.selectAll("circle, rect, path").classed("highlighted", false);
    d3.selectAll("circle, rect, path").classed("dimmed", false);
    updateSummaryStats();
  }

  // ================= Scatter Plot 1: Economy vs Happiness =================
  const scatterSvg = d3.select("#scatterPlot");
  const gScatter = scatterSvg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xScatter = d3.scaleLinear()
    .domain([0, d3.max(data, d => d['Economy (GDP per Capita)'])])
    .range([0, width]);

  const yScatter = d3.scaleLinear()
    .domain([0, d3.max(data, d => d['Happiness Score'])])
    .range([height, 0]);

  // Add axis labels
  gScatter.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", 0 - margin.left)
    .attr("x", 0 - (height / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("fill", "#2c3e50")
    .text("Happiness Score");

  gScatter.append("text")
    .attr("transform", `translate(${width / 2}, ${height + margin.bottom - 10})`)
    .style("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("fill", "#2c3e50")
    .text("Economy (GDP per Capita)");

  gScatter.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScatter).tickFormat(d3.format(".2f")));

  gScatter.append("g")
    .attr("class", "y-axis")
    .call(d3.axisLeft(yScatter).tickFormat(d3.format(".1f")));

  // Add grid lines
  gScatter.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScatter)
      .tickSize(-height)
      .tickFormat(""))
    .style("stroke-dasharray", "3,3")
    .style("opacity", 0.3);

  gScatter.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(yScatter)
      .tickSize(-width)
      .tickFormat(""))
    .style("stroke-dasharray", "3,3")
    .style("opacity", 0.3);

  // Create circles with enhanced interactivity
  const circles = gScatter.selectAll("circle")
    .data(data)
    .enter().append("circle")
    .attr('data-region', d => d.Region)
    .attr("cx", d => xScatter(d['Economy (GDP per Capita)']))
    .attr("cy", d => yScatter(d['Happiness Score']))
    .attr("r", 0)
    .attr("fill", d => color(d.Region))
    .attr("opacity", 0.8)
    .attr("stroke", "#fff")
    .attr("stroke-width", 2)
    .style("cursor", "pointer")
    .on("mouseover", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("r", 10)
        .attr("opacity", 1)
        .attr("stroke-width", 3);
      showTooltip(event, d);
    })
    .on("mouseout", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("r", 6)
        .attr("opacity", 0.8)
        .attr("stroke-width", 2);
      hideTooltip();
    })
    .on("click", function(event, d) {
      // Highlight this country across all charts
      highlightCountry(d.Country);
    });

  // Animate circles on load
  circles.transition()
    .duration(1000)
    .delay((d, i) => i * 20)
    .attr("r", 6)
    .ease(d3.easeBounceOut);

  // add legend to scatterSvg
  addLegend(scatterSvg);

  // ================= Scatter Plot 2: Health vs Happiness (Color by Region) =================
  const scatterSvg2 = d3.select("#scatterPlot2");
  const gScatter2 = scatterSvg2.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xScatter2 = d3.scaleLinear()
    .domain([0, d3.max(data, d => d['Health (Life Expectancy)'])])
    .range([0, width]);

  const yScatter2 = d3.scaleLinear()
    .domain([0, d3.max(data, d => d['Happiness Score'])])
    .range([height, 0]);

  // Add axis labels
  gScatter2.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", 0 - margin.left)
    .attr("x", 0 - (height / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("fill", "#2c3e50")
    .text("Happiness Score");

  gScatter2.append("text")
    .attr("transform", `translate(${width / 2}, ${height + margin.bottom - 10})`)
    .style("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("fill", "#2c3e50")
    .text("Health (Life Expectancy)");

  gScatter2.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScatter2).tickFormat(d3.format(".2f")));

  gScatter2.append("g")
    .attr("class", "y-axis")
    .call(d3.axisLeft(yScatter2).tickFormat(d3.format(".1f")));

  // Add grid lines
  gScatter2.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScatter2)
      .tickSize(-height)
      .tickFormat(""))
    .style("stroke-dasharray", "3,3")
    .style("opacity", 0.3);

  gScatter2.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(yScatter2)
      .tickSize(-width)
      .tickFormat(""))
    .style("stroke-dasharray", "3,3")
    .style("opacity", 0.3);

  // Create interactive circles
  const circles2 = gScatter2.selectAll("circle")
    .data(data)
    .enter().append("circle")
    .attr('data-region', d => d.Region)
    .attr("cx", d => xScatter2(d['Health (Life Expectancy)']))
    .attr("cy", d => yScatter2(d['Happiness Score']))
    .attr("r", 0)
    .attr("fill", d => color(d.Region))
    .attr("opacity", 0.8)
    .attr("stroke", "#fff")
    .attr("stroke-width", 2)
    .style("cursor", "pointer")
    .on("mouseover", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("r", 10)
        .attr("opacity", 1)
        .attr("stroke-width", 3);
      showTooltip(event, d);
    })
    .on("mouseout", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("r", 6)
        .attr("opacity", 0.8)
        .attr("stroke-width", 2);
      hideTooltip();
    })
    .on("click", function(event, d) {
      highlightCountry(d.Country);
    });

  // Animate circles on load
  circles2.transition()
    .duration(1000)
    .delay((d, i) => i * 20 + 200)
    .attr("r", 6)
    .ease(d3.easeBounceOut);

  // add legend to scatterSvg2
  addLegend(scatterSvg2);

  // ... legend added via addLegend(scatterSvg2) above ...

  // ================= Scatter Plot 3: Freedom vs Happiness =================
  const scatterSvg3 = d3.select("#scatterPlot3");
  const gScatter3 = scatterSvg3.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xScatter3 = d3.scaleLinear()
    .domain([0, d3.max(data, d => d['Freedom'])])
    .range([0, width]);

  const yScatter3 = d3.scaleLinear()
    .domain([0, d3.max(data, d => d['Happiness Score'])])
    .range([height, 0]);

  // Add axis labels
  gScatter3.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", 0 - margin.left)
    .attr("x", 0 - (height / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("fill", "#2c3e50")
    .text("Happiness Score");

  gScatter3.append("text")
    .attr("transform", `translate(${width / 2}, ${height + margin.bottom - 10})`)
    .style("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("fill", "#2c3e50")
    .text("Freedom");

  gScatter3.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScatter3).tickFormat(d3.format(".2f")));

  gScatter3.append("g")
    .attr("class", "y-axis")
    .call(d3.axisLeft(yScatter3).tickFormat(d3.format(".1f")));

  // Add grid lines
  gScatter3.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScatter3)
      .tickSize(-height)
      .tickFormat(""))
    .style("stroke-dasharray", "3,3")
    .style("opacity", 0.3);

  gScatter3.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(yScatter3)
      .tickSize(-width)
      .tickFormat(""))
    .style("stroke-dasharray", "3,3")
    .style("opacity", 0.3);

  // Create interactive circles
  const circles3 = gScatter3.selectAll("circle")
    .data(data)
    .enter().append("circle")
    .attr('data-region', d => d.Region)
    .attr("cx", d => xScatter3(d['Freedom']))
    .attr("cy", d => yScatter3(d['Happiness Score']))
    .attr("r", 0)
    .attr("fill", d => color(d.Region))
    .attr("opacity", 0.8)
    .attr("stroke", "#fff")
    .attr("stroke-width", 2)
    .style("cursor", "pointer")
    .on("mouseover", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("r", 10)
        .attr("opacity", 1)
        .attr("stroke-width", 3);
      showTooltip(event, d);
    })
    .on("mouseout", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("r", 6)
        .attr("opacity", 0.8)
        .attr("stroke-width", 2);
      hideTooltip();
    })
    .on("click", function(event, d) {
      highlightCountry(d.Country);
    });

  // Animate circles on load
  circles3.transition()
    .duration(1000)
    .delay((d, i) => i * 20 + 400)
    .attr("r", 6)
    .ease(d3.easeBounceOut);

  addLegend(scatterSvg3);

  // ================= Scatter Plot 4: Family vs Happiness =================
  const scatterSvg4 = d3.select("#scatterPlot4");
  const gScatter4 = scatterSvg4.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xScatter4 = d3.scaleLinear()
    .domain([0, d3.max(data, d => d['Family'])])
    .range([0, width]);

  const yScatter4 = d3.scaleLinear()
    .domain([0, d3.max(data, d => d['Happiness Score'])])
    .range([height, 0]);

  // Add axis labels
  gScatter4.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", 0 - margin.left)
    .attr("x", 0 - (height / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("fill", "#2c3e50")
    .text("Happiness Score");

  gScatter4.append("text")
    .attr("transform", `translate(${width / 2}, ${height + margin.bottom - 10})`)
    .style("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("fill", "#2c3e50")
    .text("Family");

  gScatter4.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScatter4).tickFormat(d3.format(".2f")));

  gScatter4.append("g")
    .attr("class", "y-axis")
    .call(d3.axisLeft(yScatter4).tickFormat(d3.format(".1f")));

  // Add grid lines
  gScatter4.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScatter4)
      .tickSize(-height)
      .tickFormat(""))
    .style("stroke-dasharray", "3,3")
    .style("opacity", 0.3);

  gScatter4.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(yScatter4)
      .tickSize(-width)
      .tickFormat(""))
    .style("stroke-dasharray", "3,3")
    .style("opacity", 0.3);

  // Create interactive circles
  const circles4 = gScatter4.selectAll("circle")
    .data(data)
    .enter().append("circle")
    .attr('data-region', d => d.Region)
    .attr("cx", d => xScatter4(d['Family']))
    .attr("cy", d => yScatter4(d['Happiness Score']))
    .attr("r", 0)
    .attr("fill", d => color(d.Region))
    .attr("opacity", 0.8)
    .attr("stroke", "#fff")
    .attr("stroke-width", 2)
    .style("cursor", "pointer")
    .on("mouseover", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("r", 10)
        .attr("opacity", 1)
        .attr("stroke-width", 3);
      showTooltip(event, d);
    })
    .on("mouseout", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("r", 6)
        .attr("opacity", 0.8)
        .attr("stroke-width", 2);
      hideTooltip();
    })
    .on("click", function(event, d) {
      highlightCountry(d.Country);
    });

  // Animate circles on load
  circles4.transition()
    .duration(1000)
    .delay((d, i) => i * 20 + 600)
    .attr("r", 6)
    .ease(d3.easeBounceOut);

  addLegend(scatterSvg4);

  // ================= Scatter Plot 5: Trust vs Happiness =================
  const scatterSvg5 = d3.select("#scatterPlot5");
  const gScatter5 = scatterSvg5.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xScatter5 = d3.scaleLinear()
    .domain([0, d3.max(data, d => d['Trust (Government Corruption)'])])
    .range([0, width]);

  const yScatter5 = d3.scaleLinear()
    .domain([0, d3.max(data, d => d['Happiness Score'])])
    .range([height, 0]);

  // Add axis labels
  gScatter5.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", 0 - margin.left)
    .attr("x", 0 - (height / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("fill", "#2c3e50")
    .text("Happiness Score");

  gScatter5.append("text")
    .attr("transform", `translate(${width / 2}, ${height + margin.bottom - 10})`)
    .style("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("fill", "#2c3e50")
    .text("Trust (Government Corruption)");

  gScatter5.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScatter5).tickFormat(d3.format(".2f")));

  gScatter5.append("g")
    .attr("class", "y-axis")
    .call(d3.axisLeft(yScatter5).tickFormat(d3.format(".1f")));

  // Add grid lines
  gScatter5.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScatter5)
      .tickSize(-height)
      .tickFormat(""))
    .style("stroke-dasharray", "3,3")
    .style("opacity", 0.3);

  gScatter5.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(yScatter5)
      .tickSize(-width)
      .tickFormat(""))
    .style("stroke-dasharray", "3,3")
    .style("opacity", 0.3);

  // Create interactive circles
  const circles5 = gScatter5.selectAll("circle")
    .data(data)
    .enter().append("circle")
    .attr('data-region', d => d.Region)
    .attr("cx", d => xScatter5(d['Trust (Government Corruption)']))
    .attr("cy", d => yScatter5(d['Happiness Score']))
    .attr("r", 0)
    .attr("fill", d => color(d.Region))
    .attr("opacity", 0.8)
    .attr("stroke", "#fff")
    .attr("stroke-width", 2)
    .style("cursor", "pointer")
    .on("mouseover", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("r", 10)
        .attr("opacity", 1)
        .attr("stroke-width", 3);
      showTooltip(event, d);
    })
    .on("mouseout", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("r", 6)
        .attr("opacity", 0.8)
        .attr("stroke-width", 2);
      hideTooltip();
    })
    .on("click", function(event, d) {
      highlightCountry(d.Country);
    });

  // Animate circles on load
  circles5.transition()
    .duration(1000)
    .delay((d, i) => i * 20 + 800)
    .attr("r", 6)
    .ease(d3.easeBounceOut);

  addLegend(scatterSvg5);

  // ================= Chart 6: Bar Chart - Average Happiness by Region =================
  const barSvg = d3.select("#chart6");
  const gBar = barSvg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const avgByRegion = d3.rollup(
    data,
    v => d3.mean(v, d => d['Happiness Score']),
    d => d.Region
  );

  const xBar = d3.scaleBand()
    .domain([...avgByRegion.keys()])
    .range([0, width])
    .padding(0.3);

  const yBar = d3.scaleLinear()
    .domain([0, d3.max(avgByRegion.values())])
    .range([height, 0]);

  // Add axis labels
  gBar.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", 0 - margin.left)
    .attr("x", 0 - (height / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("fill", "#2c3e50")
    .text("Average Happiness Score");

  gBar.append("text")
    .attr("transform", `translate(${width / 2}, ${height + margin.bottom - 10})`)
    .style("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("fill", "#2c3e50")
    .text("Region");

  gBar.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xBar));

  gBar.append("g")
    .attr("class", "y-axis")
    .call(d3.axisLeft(yBar).tickFormat(d3.format(".1f")));

  // Add grid lines
  gBar.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(yBar)
      .tickSize(-width)
      .tickFormat(""))
    .style("stroke-dasharray", "3,3")
    .style("opacity", 0.3);

  // Create interactive bars
  const bars = gBar.selectAll("rect")
    .data([...avgByRegion])
    .enter().append("rect")
    .attr('data-region', d => d[0])
    .attr("x", d => xBar(d[0]))
    .attr("y", height)
    .attr("width", xBar.bandwidth())
    .attr("height", 0)
    .attr("fill", d => color(d[0]))
    .attr("opacity", 0.8)
    .style('pointer-events', 'all')
    .style("cursor", "pointer")
    .on("mouseover", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("opacity", 1)
        .attr("stroke", "#fff")
        .attr("stroke-width", 2);
      showTooltip(event, {
        Country: d[0],
        'Happiness Score': d[1],
        Region: d[0]
      });
    })
    .on('mousemove', function(event, d) {
      // follow cursor for better visibility
      tooltip.style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 10) + 'px');
    })
    .on("mouseout", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("opacity", 0.8)
        .attr("stroke", "none");
      hideTooltip();
    })
    .on("click", function(event, d) {
      // Filter data by region
      filteredData = data.filter(country => country.Region === d[0]);
      updateSummaryStats();
    });

  // Animate bars on load
  bars.transition()
    .duration(1000)
    .delay((d, i) => i * 100 + 1000)
    .attr("y", d => yBar(d[1]))
    .attr("height", d => height - yBar(d[1]))
    .ease(d3.easeBounceOut);

  // add legend beside bar chart
  addLegend(barSvg, width + margin.left + 10, margin.top);

  // ================= Chart 7: Line Chart - Top 10 GDP Countries vs Happiness =================
  const lineSvg = d3.select("#chart7");
  const gLine = lineSvg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const topGDP = data.sort((a, b) => b['Economy (GDP per Capita)'] - a['Economy (GDP per Capita)']).slice(0, 10);

  const xLine = d3.scalePoint()
    .domain(topGDP.map(d => d.Country))
    .range([0, width]);

  const yLine = d3.scaleLinear()
    .domain([0, d3.max(topGDP, d => d['Happiness Score'])])
    .range([height, 0]);

  gLine.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xLine))
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end");

  gLine.append("g")
    .attr("class", "y-axis")
    .call(d3.axisLeft(yLine));

  const lineGen = d3.line()
    .x(d => xLine(d.Country))
    .y(d => yLine(d['Happiness Score']));

  gLine.append("path")
    .datum(topGDP)
    .attr("fill", "none")
    .attr("stroke", "#ff6b6b")
    .attr("stroke-width", 2)
    .attr("d", lineGen);

  gLine.selectAll("circle")
    .data(topGDP)
    .enter().append("circle")
    .attr("cx", d => xLine(d.Country))
    .attr("cy", d => yLine(d['Happiness Score']))
    .attr("r", 5)
    .attr("fill", "#ff6b6b");

  // ================= Chart 8: Histogram - Happiness Score Distribution =================
  const histSvg = d3.select("#chart8");
  const gHist = histSvg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xHist = d3.scaleLinear()
    .domain([0, d3.max(data, d => d['Happiness Score'])])
    .range([0, width]);

  const histogram = d3.bin()
    .value(d => d['Happiness Score'])
    .domain(xHist.domain())
    .thresholds(10);

  const bins = histogram(data);

  const yHist = d3.scaleLinear()
    .domain([0, d3.max(bins, d => d.length)])
    .range([height, 0]);

  gHist.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xHist));

  gHist.append("g")
    .attr("class", "y-axis")
    .call(d3.axisLeft(yHist));

  // Create interactive histogram bars
  const histBars = gHist.selectAll("rect")
    .data(bins)
    .enter().append("rect")
    .attr("x", d => xHist(d.x0) + 1)
    .attr("y", height)
    .attr("width", d => xHist(d.x1) - xHist(d.x0) - 1)
    .attr("height", 0)
    .attr("fill", "#4ecdc4")
    .attr("opacity", 0.8)
    .style('pointer-events', 'all')
    .style("cursor", "pointer")
    .on("mouseover", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("opacity", 1)
        .attr("stroke", "#fff")
        .attr("stroke-width", 2);
      showTooltip(event, {
        Country: `${d.length} countries`,
        'Happiness Score': `${d.x0.toFixed(1)} - ${d.x1.toFixed(1)}`,
        Region: `Range`
      });
    })
    .on('mousemove', function(event, d) {
      tooltip.style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 10) + 'px');
    })
    .on("mouseout", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("opacity", 0.8)
        .attr("stroke", "none");
      hideTooltip();
    });

  // Animate histogram bars on load
  histBars.transition()
    .duration(1000)
    .delay((d, i) => i * 50 + 2000)
    .attr("y", d => yHist(d.length))
    .attr("height", d => height - yHist(d.length))
    .ease(d3.easeBounceOut);

  // Initialize summary stats
  updateSummaryStats();

  // Function to update all charts with filtered data
  function updateAllCharts() {
    // Helper to redraw a scatter plot (removes old points and draws new)
    function redrawScatter(g, xScale, yScale, xAccessor, yAccessor) {
      // update axes (assumes .x-axis and .y-axis already exist)
      g.select(".x-axis").transition().duration(500).call(d3.axisBottom(xScale).tickFormat(d3.format(".2f")));
      g.select(".y-axis").transition().duration(500).call(d3.axisLeft(yScale).tickFormat(d3.format(".1f")));

      // remove old points and draw new ones from filteredData
      g.selectAll("circle").remove();

      const pts = g.selectAll("circle")
        .data(filteredData, d => d.Country)
        .enter().append("circle")
        .attr('data-region', d => d.Region)
        .attr("cx", d => xScale(xAccessor(d)))
        .attr("cy", d => yScale(yAccessor(d)))
        .attr("r", 0)
        .attr("fill", d => color(d.Region))
        .attr("opacity", 0.8)
        .attr("stroke", "#fff")
        .attr("stroke-width", 2)
        .style("cursor", "pointer")
        .on("mouseover", function(event, d) {
          d3.select(this).transition().duration(200).attr("r", 10).attr("opacity", 1).attr("stroke-width", 3);
          showTooltip(event, d);
        })
        .on("mouseout", function(event, d) {
          d3.select(this).transition().duration(200).attr("r", 6).attr("opacity", 0.8).attr("stroke-width", 2);
          hideTooltip();
        })
        .on("click", function(event, d) {
          highlightCountry(d.Country);
        });

      // animate in
      pts.transition()
        .duration(600)
        .delay((d, i) => i * 10)
        .attr("r", 6)
        .ease(d3.easeCubicOut);
    }

    // If no data, do nothing
    if (!filteredData || filteredData.length === 0) {
      // clear plots
      gScatter.selectAll("circle").remove();
      gScatter2.selectAll("circle").remove();
      gScatter3.selectAll("circle").remove();
      gScatter4.selectAll("circle").remove();
      gScatter5.selectAll("circle").remove();
      // update summaries
      updateSummaryStats();
      return;
    }

    // --- Scatter 1: Economy vs Happiness ---
    xScatter.domain([0, d3.max(filteredData, d => d['Economy (GDP per Capita)'])]);
    yScatter.domain([0, d3.max(filteredData, d => d['Happiness Score'])]);
    redrawScatter(gScatter, xScatter, yScatter, d => d['Economy (GDP per Capita)'], d => d['Happiness Score']);

    // --- Scatter 2: Health vs Happiness ---
    xScatter2.domain([0, d3.max(filteredData, d => d['Health (Life Expectancy)'])]);
    yScatter2.domain([0, d3.max(filteredData, d => d['Happiness Score'])]);
    redrawScatter(gScatter2, xScatter2, yScatter2, d => d['Health (Life Expectancy)'], d => d['Happiness Score']);

    // --- Scatter 3: Freedom vs Happiness ---
    xScatter3.domain([0, d3.max(filteredData, d => d['Freedom'])]);
    yScatter3.domain([0, d3.max(filteredData, d => d['Happiness Score'])]);
    redrawScatter(gScatter3, xScatter3, yScatter3, d => d['Freedom'], d => d['Happiness Score']);

    // --- Scatter 4: Family vs Happiness ---
    xScatter4.domain([0, d3.max(filteredData, d => d['Family'])]);
    yScatter4.domain([0, d3.max(filteredData, d => d['Happiness Score'])]);
    redrawScatter(gScatter4, xScatter4, yScatter4, d => d['Family'], d => d['Happiness Score']);

    // --- Scatter 5: Trust vs Happiness ---
    xScatter5.domain([0, d3.max(filteredData, d => d['Trust (Government Corruption)'])]);
    yScatter5.domain([0, d3.max(filteredData, d => d['Happiness Score'])]);
    redrawScatter(gScatter5, xScatter5, yScatter5, d => d['Trust (Government Corruption)'], d => d['Happiness Score']);

    // --- Bar chart (Average Happiness by Region) ---
    const avgByRegionFiltered = d3.rollup(
      filteredData,
      v => d3.mean(v, d => d['Happiness Score']),
      d => d.Region
    );
    // update yBar domain and axis
    yBar.domain([0, d3.max(avgByRegionFiltered.values()) || 0]);
    gBar.select(".y-axis").transition().duration(500).call(d3.axisLeft(yBar).tickFormat(d3.format(".1f")));
    // redraw bars
    gBar.selectAll("rect").remove();
    gBar.selectAll("rect")
      .data([...avgByRegionFiltered])
      .enter().append("rect")
      .attr('data-region', d => d[0])
      .attr("x", d => xBar(d[0]))
      .attr("y", d => yBar(d[1]))
      .attr("width", xBar.bandwidth())
      .attr("height", d => height - yBar(d[1]))
      .attr("fill", d => color(d[0]))
      .attr("opacity", 0.8)
      .style('pointer-events', 'all')
      .style("cursor", "pointer")
      .on("mouseover", function(event, d) {
        d3.select(this).transition().duration(200).attr("opacity", 1).attr("stroke", "#fff").attr("stroke-width", 2);
        showTooltip(event, { Country: d[0], 'Happiness Score': d[1], Region: d[0] });
      })
      .on('mousemove', function(event, d) {
        tooltip.style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 10) + 'px');
      })
      .on("mouseout", function() {
        d3.select(this).transition().duration(200).attr("opacity", 0.8).attr("stroke", "none");
        hideTooltip();
      })
      .on("click", function(event, d) {
        filteredData = data.filter(country => country.Region === d[0]);
        updateAllCharts();
        updateSummaryStats();
      });

    // --- Line chart (Top 10 GDP) ---
    const topGDPFiltered = filteredData.sort((a, b) => b['Economy (GDP per Capita)'] - a['Economy (GDP per Capita)']).slice(0, 10);
    yLine.domain([0, d3.max(topGDPFiltered, d => d['Happiness Score']) || 0]);
    gLine.select(".y-axis").transition().duration(500).call(d3.axisLeft(yLine).tickFormat(d3.format(".1f")));
    gLine.selectAll("path").remove();
    gLine.selectAll("circle").remove();
    if (topGDPFiltered.length) {
      const lineGenLocal = d3.line()
        .x(d => xLine(d.Country))
        .y(d => yLine(d['Happiness Score']));
      gLine.append("path")
        .datum(topGDPFiltered)
        .attr("fill", "none")
        .attr("stroke", "#ff6b6b")
        .attr("stroke-width", 2)
        .attr("d", lineGenLocal)
        .style("opacity", 0)
        .transition().duration(500).style("opacity", 1);

      gLine.selectAll("circle")
        .data(topGDPFiltered, d => d.Country)
        .enter().append("circle")
        .attr("cx", d => xLine(d.Country))
        .attr("cy", d => yLine(d['Happiness Score']))
        .attr("r", 5)
        .attr("fill", "#ff6b6b")
        .style("cursor", "pointer")
        .on("mouseover", function(event, d) {
          d3.select(this).transition().duration(200).attr("r", 8);
          showTooltip(event, d);
        })
        .on("mouseout", function(event, d) {
          d3.select(this).transition().duration(200).attr("r", 5);
          hideTooltip();
        })
        .on("click", function(event, d) {
          highlightCountry(d.Country);
        });
    }

    // --- Histogram ---
    const histogramLocal = d3.bin()
      .value(d => d['Happiness Score'])
      .domain(xHist.domain())
      .thresholds(10);
    const bins = histogramLocal(filteredData);
    const yHistLocal = d3.scaleLinear()
      .domain([0, d3.max(bins, d => d.length) || 0])
      .range([height, 0]);
    gHist.select(".y-axis").transition().duration(500).call(d3.axisLeft(yHistLocal));
    gHist.selectAll("rect").remove();
    gHist.selectAll("rect")
      .data(bins)
      .enter().append("rect")
      .attr("x", d => xHist(d.x0) + 1)
      .attr("y", d => yHistLocal(d.length))
      .attr("width", d => Math.max(0, xHist(d.x1) - xHist(d.x0) - 1))
      .attr("height", d => height - yHistLocal(d.length))
      .attr("fill", "#4ecdc4")
      .attr("opacity", 0.8)
      .style("cursor", "pointer")
      .on("mouseover", function(event, d) {
        d3.select(this).transition().duration(200).attr("opacity", 1).attr("stroke", "#fff").attr("stroke-width", 2);
        showTooltip(event, { Country: `${d.length} countries`, 'Happiness Score': `${d.x0.toFixed(1)} - ${d.x1.toFixed(1)}`, Region: `Range` });
      })
      .on("mouseout", function() {
        d3.select(this).transition().duration(200).attr("opacity", 0.8).attr("stroke", "none");
        hideTooltip();
      });

    // Finally update summary
    updateSummaryStats();
  }

  // Add interactive controls functionality
  function setupControls() {
    // Populate region filter
    const regionFilter = d3.select("#region-filter");
    regions.forEach(region => {
      regionFilter.append("option")
        .attr("value", region)
        .text(region);
    });

    // Region filter functionality
    regionFilter.on("change", function() {
      const selectedRegion = this.value;
      let currentData = data;
      
      // Apply region filter
      if (selectedRegion !== "all") {
        currentData = currentData.filter(d => d.Region === selectedRegion);
      }
      
      // Apply country search if set
      const searchTerm = d3.select("#country-search").property("value").toLowerCase();
      if (searchTerm !== "") {
        currentData = currentData.filter(d => d.Country.toLowerCase().includes(searchTerm));
      }
      
      // Apply happiness range filter
      const min = +happinessMin.property("value");
      const max = +happinessMax.property("value");
      filteredData = currentData.filter(d => d['Happiness Score'] >= min && d['Happiness Score'] <= max);
      
      updateAllCharts();
      updateSummaryStats();
      resetHighlights();
    });

    // Happiness range filter
    const happinessMin = d3.select("#happiness-min");
    const happinessMax = d3.select("#happiness-max");
    const happinessRangeText = d3.select("#happiness-range-text");

    function updateHappinessRange() {
      const min = +happinessMin.property("value");
      const max = +happinessMax.property("value");
      happinessRangeText.text(`${min.toFixed(1)} - ${max.toFixed(1)}`);
      
      // Start with all data and apply all filters
      let currentData = data;
      
      // Apply region filter if set
      const selectedRegion = d3.select("#region-filter").property("value");
      if (selectedRegion !== "all") {
        currentData = currentData.filter(d => d.Region === selectedRegion);
      }
      
      // Apply country search if set
      const searchTerm = d3.select("#country-search").property("value").toLowerCase();
      if (searchTerm !== "") {
        currentData = currentData.filter(d => d.Country.toLowerCase().includes(searchTerm));
      }
      
      // Apply happiness range filter
      filteredData = currentData.filter(d => d['Happiness Score'] >= min && d['Happiness Score'] <= max);
      
      updateAllCharts();
      updateSummaryStats();
      resetHighlights();
    }

    happinessMin.on("input", updateHappinessRange);
    happinessMax.on("input", updateHappinessRange);

    // Country search functionality
    const countrySearch = d3.select("#country-search");
    countrySearch.on("input", function() {
      const searchTerm = this.value.toLowerCase();
      let currentData = data;
      
      // Apply region filter if set
      const selectedRegion = d3.select("#region-filter").property("value");
      if (selectedRegion !== "all") {
        currentData = currentData.filter(d => d.Region === selectedRegion);
      }
      
      // Apply country search
      if (searchTerm !== "") {
        currentData = currentData.filter(d => d.Country.toLowerCase().includes(searchTerm));
      }
      
      // Apply happiness range filter
      const min = +happinessMin.property("value");
      const max = +happinessMax.property("value");
      filteredData = currentData.filter(d => d['Happiness Score'] >= min && d['Happiness Score'] <= max);
      
      updateAllCharts();
      updateSummaryStats();
      resetHighlights();
    });
  }

  // Initialize controls
  setupControls();

  // Add reset button
  const resetButton = d3.select("body").append("div")
    .attr("id", "reset-button")
    .style("position", "fixed")
    .style("bottom", "20px")
    .style("right", "20px")
    .style("z-index", "1000")
    .style("background", "linear-gradient(135deg, #667eea, #764ba2)")
    .style("color", "white")
    .style("padding", "12px 20px")
    .style("border-radius", "25px")
    .style("cursor", "pointer")
    .style("box-shadow", "0 5px 15px rgba(102, 126, 234, 0.4)")
    .style("font-weight", "bold")
    .style("font-size", "14px")
    .text("🔄 Reset View")
    .on("click", function() {
      filteredData = data;
      
      // Reset all controls
      d3.select("#region-filter").property("value", "all");
      d3.select("#happiness-min").property("value", 0);
      d3.select("#happiness-max").property("value", 10);
      d3.select("#happiness-range-text").text("0.0 - 10.0");
      d3.select("#country-search").property("value", "");
      
      updateAllCharts();
      updateSummaryStats();
      resetHighlights();
    })
    .on("mouseover", function() {
      d3.select(this)
        .transition()
        .duration(200)
        .style("transform", "scale(1.05)")
        .style("box-shadow", "0 8px 25px rgba(102, 126, 234, 0.6)");
    })
    .on("mouseout", function() {
      d3.select(this)
        .transition()
        .duration(200)
        .style("transform", "scale(1)")
        .style("box-shadow", "0 5px 15px rgba(102, 126, 234, 0.4)");
    });

});