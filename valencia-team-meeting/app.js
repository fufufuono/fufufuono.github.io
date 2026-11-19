(function () {
  "use strict";
  const D = window.VALENCIA_DATA;
  if (!D) return;
  const names = ["home", "schedule", "dining", "info"];
  const escapeHtml = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  };
  const mapUrl = function (address) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address);
  };
  const getLocalDate = function () {
    const parts = new Intl.DateTimeFormat("en-GB", {timeZone:D.timezone, year:"numeric", month:"2-digit", day:"2-digit"}).formatToParts(new Date());
    const values = {};
    parts.forEach(function(p){ values[p.type] = p.value; });
    return values.year + "-" + values.month + "-" + values.day;
  };
  const makeTime = function (date, time) {
    /* Valencia is CET (UTC+1) throughout the 22–27 November 2026 meeting. */
    return new Date(date + "T" + time + ":00+01:00").getTime();
  };
  const getEventsFor = function (date) {
    const events = [];
    const agenda = D.meetingAgenda[date] || [];
    agenda.forEach(function (s) {
      if (!s.start || !s.title) return;
      events.push({time:s.start, title:s.title, kind:"Meeting session", description:[s.presenter ? "Presenter: " + s.presenter : "", s.room ? "Room: " + s.room : "", s.notes || ""].filter(Boolean).join(" · "), address:""});
    });
    if (D.teamActivity.date === date) {
      events.push({time:D.teamActivity.time, title:D.teamActivity.title, kind:"Team activity", description:"Meet at " + D.teamActivity.meetingPoint + " · Transportation arranged", address:D.hotel.address});
    }
    D.dinners.filter(function (r) { return r.date === date; }).forEach(function (r) {
      events.push({time:r.time, title:"Team dinner", kind:"Dinner", description:r.name, address:r.address, dinner:true});
    });
    return events.sort(function (a,b) { return a.time.localeCompare(b.time); });
  };
  let selectedDate = (function () {
    const today = getLocalDate();
    const first = D.dates.find(function (d) { return d.date >= today; });
    return first ? first.date : D.dates[D.dates.length-1].date;
  })();
  function dayMeta(date) { return D.dates.find(function (d) { return d.date === date; }) || D.dates[0]; }
  function linkToMap(address,label,klass) {
    return '<a class="' + (klass || "mini-action") + '" href="' + escapeHtml(mapUrl(address)) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label || "Get directions") + ' <span aria-hidden="true">↗</span></a>';
  }
  function renderTabs(id) {
    const root=document.getElementById(id);
    root.innerHTML=D.dates.map(function(d) {
      const active=d.date===selectedDate;
      return '<button class="day-tab" type="button" data-select-date="' + d.date + '" aria-pressed="' + active + '" aria-label="' + d.label + ' ' + d.number + ' November"><span class="weekday">' + d.day + '</span><span class="day-number">' + d.number + '</span><span class="day-dot"></span></button>';
    }).join("");
  }
  function renderSchedule() {
    renderTabs("schedule-days");
    const meta=dayMeta(selectedDate);
    const events=getEventsFor(selectedDate);
    const agenda=D.meetingAgenda[selectedDate] || [];
    let html='<div class="detail-top"><div><div class="day-full">' + meta.label + ', ' + meta.number + ' November</div><p>All times in Valencia · Europe/Madrid</p></div><span class="soft-tag">Day ' + (D.dates.indexOf(meta)+1) + ' / 6</span></div>';
    if (!agenda.length) {
      html+='<div class="agenda-notice"><span class="agenda-note-meta">MEETING AGENDA · TO BE ANNOUNCED</span><p>Detailed sessions, speakers, rooms and times will appear here when confirmed. No meeting times have been assumed.</p></div>';
    }
    if (!events.length) {
      html+='<div class="card timeline-card"><h3>No confirmed timed activities yet</h3><p>Check back for updates.</p></div>';
    } else {
      html+='<div class="timeline">';
      events.forEach(function(ev) {
        html+='<div class="timeline-item"><span class="timeline-time">' + escapeHtml(ev.time) + '</span><span class="timeline-track"><span class="timeline-dot"></span></span><article class="timeline-card"><span class="category">' + escapeHtml(ev.kind.toUpperCase()) + '</span><h3>' + escapeHtml(ev.title) + '</h3><p>' + escapeHtml(ev.description) + '</p>';
        if(ev.dinner) html+='<a href="#dining" data-route="dining" class="mini-action">See dinner details ↗</a>';
        else if(ev.kind==="Team activity") html+='<a href="#info" data-route="info" class="mini-action">See activity details ↗</a>';
        else if(ev.address) html+=linkToMap(ev.address, "Directions");
        html+='</article></div>';
      });
      html+='</div>';
    }
    document.getElementById("schedule-detail").innerHTML=html;
  }
  function renderDining() {
    renderTabs("dining-days");
    const d=D.dinners.find(function(r){return r.date===selectedDate;});
    let html="";
    if(d) {
      html='<article class="card dinner-card"><span class="card-kicker">DINNER · ' + escapeHtml(dayMeta(selectedDate).label.toUpperCase()) + ' ' + dayMeta(selectedDate).number + ' NOV</span><h2>' + escapeHtml(d.name) + '</h2><div class="dinner-time">' + escapeHtml(d.time) + ' · Valencia local time</div><p class="dinner-address">' + escapeHtml(d.address) + '</p><div class="button-row">' + linkToMap(d.address,"Open in Google Maps","button button-green") + '</div></article>';
    }
    document.getElementById("dining-detail").innerHTML=html;
    renderMeals();
  }
  function renderMeals() {
    const term=document.getElementById("meal-name").value.trim().toLocaleLowerCase();
    const root=document.getElementById("meal-results");
    const matches=D.mealSelections.filter(function(r) {
      return r.date===selectedDate && term && r.name.toLocaleLowerCase().includes(term);
    });
    if (!D.mealSelections.length) {
      root.innerHTML='<span class="empty-dot"></span> Meal information has not been uploaded yet.';
    } else if (!term) {
      root.innerHTML='<span class="empty-dot"></span> Enter a name to look up a pre-selected meal.';
    } else if (!matches.length) {
      root.innerHTML='<span class="empty-dot"></span> No published meal record matches this search for ' + escapeHtml(dayMeta(selectedDate).label) + '.';
    } else {
      root.innerHTML=matches.map(function(r) {
        const courses=(r.courses||[]).map(function(c){return '<div class="meal-course"><strong>'+escapeHtml(c.label)+':</strong> '+escapeHtml(c.value)+'</div>';}).join("");
        return '<div class="meal-result-person">'+escapeHtml(r.name)+'</div>'+courses;
      }).join('<hr>');
    }
  }
  function upcomingEvents() {
    const now=Date.now(), out=[];
    D.dates.forEach(function(d) {
      getEventsFor(d.date).forEach(function(e) {
        const at=makeTime(d.date,e.time);
        if(at>now)out.push(Object.assign({},e,{date:d.date,at:at}));
      });
    });
    return out.sort(function(a,b){return a.at-b.at;});
  }
  function updateNext() {
    const root=document.getElementById("upcoming-card");
    const next=upcomingEvents()[0];
    if(!next) {
      root.innerHTML='<div class="upcoming-details"><span class="kicker">THANK YOU</span><h3>All confirmed activities have finished</h3><p>We hope you enjoyed the week in Valencia.</p></div>';
      return;
    }
    const meta=dayMeta(next.date), remaining=next.at-Date.now();
    const days=Math.floor(remaining/86400000), hours=Math.floor((remaining%86400000)/3600000), minutes=Math.floor((remaining%3600000)/60000);
    const display=days>0 ? days + 'd ' + hours + 'h' : hours>0 ? hours + 'h ' + minutes + 'm' : minutes + ' min';
    root.innerHTML='<div class="upcoming-main"><div class="event-date-badge"><small>' + meta.day + '</small><strong>' + meta.number + '</strong></div><div class="upcoming-details"><span class="kicker">' + escapeHtml(next.kind) + ' · ' + escapeHtml(next.time) + '</span><h3>' + escapeHtml(next.kind === "Dinner" ? next.description : next.title) + '</h3><p>' + escapeHtml(next.kind === "Dinner" ? "Team dinner" : next.description) + '</p></div></div><div class="countdown"><strong>' + display + '</strong><span>Until it starts</span></div>';
  }
  function activateRoute() {
    const fromHash=window.location.hash.replace(/^#/,"").toLowerCase();
    const route=names.includes(fromHash) ? fromHash : "home";
    names.forEach(function(name) {
      const el=document.getElementById("page-"+name);
      el.hidden=name!==route;
      el.classList.toggle("is-visible",name===route);
    });
    document.querySelectorAll("[data-route]").forEach(function(a) {
      const active=a.getAttribute("data-route")===route;
      a.classList.toggle("is-active",active);
      if(active)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");
    });
    if(route==="schedule")renderSchedule();
    if(route==="dining")renderDining();
    window.scrollTo({top:0,behavior:"auto"});
  }
  document.addEventListener("click",function(ev) {
    const btn=ev.target.closest("[data-select-date]");
    if(btn) {
      selectedDate=btn.getAttribute("data-select-date");
      renderSchedule();renderDining();
    }
  });
  document.getElementById("meal-name").addEventListener("input",renderMeals);
  document.getElementById("hotel-map-link").href=mapUrl(D.hotel.address);
  document.getElementById("hotel-address").textContent=D.hotel.address;
  document.getElementById("copy-hotel").addEventListener("click",async function() {
    const btn=this;
    try {await navigator.clipboard.writeText(D.hotel.address);btn.textContent="Copied!";}
    catch(e) {window.prompt("Copy the hotel address:",D.hotel.address);btn.textContent="Copy address";}
    window.setTimeout(function(){btn.textContent="Copy address";},1800);
  });
  window.addEventListener("hashchange",activateRoute);
  renderSchedule();renderDining();updateNext();activateRoute();
  window.setInterval(updateNext,30000);
})();