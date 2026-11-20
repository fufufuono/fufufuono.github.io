(function () {
  "use strict";
  const D = window.VALENCIA_DATA;
  if (!D) return;
  const names = ["home", "dining"];
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
    if (D.teamActivity.date === date) {
      events.push({time:D.teamActivity.time, title:D.teamActivity.title, kind:"Team activity", description:"Meet at " + D.teamActivity.meetingPoint + " · Transportation arranged"});
    }
    D.dinners.filter(function(r){return r.date===date;}).forEach(function(r){
      events.push({time:r.time, title:"Team dinner", kind:"Dinner", description:r.name, dinner:true});
    });
    return events.sort(function(a,b){return a.time.localeCompare(b.time);});
  };
  let selectedDate = (function () {
    const today = getLocalDate();
    const first = D.dates.find(function (d) { return d.date >= today; });
    return first ? first.date : D.dates[D.dates.length-1].date;
  })();
  function dayMeta(date) { return D.dates.find(function (d) { return d.date === date; }) || D.dates[0]; }
  function linkToMap(address,label,klass,directLink) {
    const destination = directLink || mapUrl(address);
    return '<a class="' + (klass || "mini-action") + '" href="' + escapeHtml(destination) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label || "Get directions") + ' <span aria-hidden="true">↗</span></a>';
  }
  function renderTabs(id) {
    const root=document.getElementById(id);
    root.innerHTML=D.dates.map(function(d) {
      const active=d.date===selectedDate;
      return '<button class="day-tab" type="button" data-select-date="' + d.date + '" aria-pressed="' + active + '" aria-label="' + d.label + ' ' + d.number + ' November"><span class="weekday">' + d.day + '</span><span class="day-number">' + d.number + '</span><span class="day-dot"></span></button>';
    }).join("");
  }
  function renderDining() {
    renderTabs("dining-days");
    const d=D.dinners.find(function(r){return r.date===selectedDate;});
    let html="";
    if(d) {
      html='<article class="card dinner-card"><span class="card-kicker">DINNER · ' + escapeHtml(dayMeta(selectedDate).label.toUpperCase()) + ' ' + dayMeta(selectedDate).number + ' NOV</span><h2>' + escapeHtml(d.name) + '</h2><div class="dinner-time">' + escapeHtml(d.time) + ' · Valencia local time</div><p class="dinner-address">' + escapeHtml(d.address) + '</p><div class="button-row">' + linkToMap(d.address,"Open in Google Maps","button button-green",d.mapUrl) + '<button type="button" class="button button-light" data-copy-dinner>Copy address</button></div></article>';
    }
    document.getElementById("dining-detail").innerHTML=html;
    renderMeals();
  }
  let mealsUnlocked = false;
  function normalizeMealName(value) {
    return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  }
  function renderMeals() {
    const root=document.getElementById("meal-results");
    if (!mealsUnlocked) {
      root.innerHTML='<span class="empty-dot"></span> Unlock meal information to search.';
      return;
    }
    const dayRows=D.mealSelections.filter(function(r){return r.date===selectedDate;});
    if (!dayRows.length) {
      root.innerHTML='<span class="empty-dot"></span> No meal-selection sheet was supplied for ' + escapeHtml(dayMeta(selectedDate).label) + ' ' + escapeHtml(String(dayMeta(selectedDate).number)) + ' November.';
      return;
    }
    const term=normalizeMealName(document.getElementById("meal-name").value);
    if (!term) {
      root.innerHTML='<span class="empty-dot"></span> Enter your first name or full name to see your pre-selected main dish.';
      return;
    }
    const matches=dayRows.filter(function(r) {
      const full=normalizeMealName(r.name);
      return full===term || full.split(" ")[0]===term || full.startsWith(term+" ");
    });
    if (!matches.length) {
      root.innerHTML='<span class="empty-dot"></span> No record matches this name for ' + escapeHtml(dayMeta(selectedDate).label) + '. Please check the spelling or ask the organiser.';
      return;
    }
    const uniqueNames=[...new Set(matches.map(function(r){return normalizeMealName(r.name);} ))];
    if (uniqueNames.length>1) {
      root.innerHTML='<div class="meal-result-person">More than one teammate has that first name.</div><p>Please enter your complete name to see the correct dish.</p>';
      return;
    }
    root.innerHTML=matches.map(function(r) {
      const courses=(r.courses||[]).map(function(c){
        return '<div class="meal-course"><strong>'+escapeHtml(c.label)+':</strong> '+escapeHtml(c.value)+'</div>';
      }).join("");
      const note=r.note ? '<div class="meal-course"><strong>Note:</strong> '+escapeHtml(r.note)+'</div>' : '';
      return '<div class="meal-result-person">'+escapeHtml(r.name)+'</div>'+courses+note;
    }).join('<hr>');
  }
  function fromBase64(s) {
    const raw=atob(s);
    return Uint8Array.from(raw,function(char){return char.charCodeAt(0);});
  }
  async function unlockMeals() {
    const input=document.getElementById("meal-access-code");
    const status=document.getElementById("meal-unlock-status");
    const btn=document.getElementById("unlock-meals");
    const accessCode=input.value.replace(/[\s-]/g,"").toUpperCase();
    if (!accessCode) { status.textContent="Enter the team access code."; return; }
    if (!window.crypto || !window.crypto.subtle) {
      status.textContent="Secure meal search requires a modern HTTPS browser.";
      return;
    }
    btn.disabled=true;
    btn.textContent="Unlocking…";
    status.textContent="Decrypting meal selections in your browser…";
    try {
      const response=await fetch("./meals.enc.json",{cache:"no-store"});
      if (!response.ok) throw new Error("Encrypted file unavailable");
      const envelope=await response.json();
      if(envelope.v!==1 || envelope.kdf!=="PBKDF2-SHA256")throw new Error("Unsupported data format");
      const baseKey=await crypto.subtle.importKey("raw",new TextEncoder().encode(accessCode),"PBKDF2",false,["deriveKey"]);
      const key=await crypto.subtle.deriveKey({
        name:"PBKDF2",salt:fromBase64(envelope.salt),iterations:envelope.iterations,hash:"SHA-256"
      },baseKey,{name:"AES-GCM",length:256},false,["decrypt"]);
      const decrypted=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromBase64(envelope.iv)},key,fromBase64(envelope.data));
      const content=JSON.parse(new TextDecoder().decode(new Uint8Array(decrypted)));
      if(content.v!==1 || !Array.isArray(content.rows) || !content.menus) throw new Error("Invalid meal data");
      D.mealSelections=content.rows.map(function(r){
        const day=String(r[0]),option=String(r[2]||"").trim(),note=String(r[3]||"").trim();
        const menu=content.menus[day] || {};
        let chosen=menu[option] || (option && option!=="/" ? option+" (dish name not specified)" : "No main dish recorded");
        if((!option || option==="/") && /vegan choice/i.test(note))chosen="Vegan choice (dish name not specified)";
        return {date:"2026-11-"+day.padStart(2,"0"),name:String(r[1]).trim(),courses:[{label:"Main dish",value:chosen}],note:note};
      });
      mealsUnlocked=true;
      input.value="";
      document.getElementById("meal-access-panel").hidden=true;
      document.getElementById("meal-search-panel").hidden=false;
      document.getElementById("meal-name").value="";
      renderMeals();
      document.getElementById("meal-name").focus();
    } catch(error) {
      status.textContent="Unable to unlock. Check the access code and your connection, then try again.";
    } finally {
      btn.disabled=false;
      btn.textContent="Unlock meals";
    }
  }
  function lockMeals() {
    mealsUnlocked=false;
    D.mealSelections=[];
    document.getElementById("meal-name").value="";
    document.getElementById("meal-search-panel").hidden=true;
    document.getElementById("meal-access-panel").hidden=false;
    document.getElementById("meal-unlock-status").textContent="Locked. The access code is not stored by this website.";
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
    const route=fromHash==="schedule" ? "dining" : (names.includes(fromHash) ? fromHash : "home");
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
    if(route==="dining")renderDining();
    window.scrollTo({top:0,behavior:"auto"});
  }
  document.addEventListener("click",function(ev) {
    const btn=ev.target.closest("[data-select-date]");
    if(btn) {
      selectedDate=btn.getAttribute("data-select-date");
      renderDining();
    }
  });
  document.addEventListener("click",async function(ev) {
    const btn=ev.target.closest("[data-copy-dinner]");
    if(!btn) return;
    const dinner=D.dinners.find(function(r){return r.date===selectedDate;});
    if(!dinner) return;
    try {
      await navigator.clipboard.writeText(dinner.address);
      btn.textContent="Copied!";
      window.setTimeout(function(){
        if(btn.isConnected) btn.textContent="Copy address";
      },1800);
    } catch(error) {
      window.prompt("Copy the restaurant address:",dinner.address);
    }
  });
  document.getElementById("meal-name").addEventListener("input",renderMeals);
  document.getElementById("unlock-meals").addEventListener("click",unlockMeals);
  document.getElementById("meal-access-code").addEventListener("keydown",function(e){
    if(e.key==="Enter"){e.preventDefault();unlockMeals();}
  });
  document.getElementById("lock-meals").addEventListener("click",lockMeals);
  document.getElementById("hotel-map-link").href=mapUrl(D.hotel.address);
  document.getElementById("hotel-address").textContent=D.hotel.address;
  document.getElementById("copy-hotel").addEventListener("click",async function() {
    const btn=this;
    try {await navigator.clipboard.writeText(D.hotel.address);btn.textContent="Copied!";}
    catch(e) {window.prompt("Copy the hotel address:",D.hotel.address);btn.textContent="Copy address";}
    window.setTimeout(function(){btn.textContent="Copy address";},1800);
  });
  window.addEventListener("hashchange",activateRoute);
  renderDining();updateNext();activateRoute();
  window.setInterval(updateNext,30000);
})();