(function(){
"use strict";
var state = { spine:null, overlay:null, q:"", fam:"all" };
var listEl = document.getElementById('list');
var emptyEl = document.getElementById('empty');
var detailEl = document.getElementById('detail');
var cardEl = document.getElementById('card');

function money(n){ return n==null ? "n.p." : "$"+n.toLocaleString('en-SG'); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }

var CAVEATS = "Monthly wages, June 2025. These figures describe full-time resident employees who held the job then; they are what incumbents earned, not what a new entrant would be offered. The 25th percentile is not starting pay. Gross includes overtime, commissions and allowances; both exclude bonuses and are before employee CPF deduction. All industries; private establishments with 25 or more staff.";

fetch('data/spine-ows2025.json').then(function(r){return r.json();}).then(function(s){
  state.spine = s;
  return fetch('data/roles-overlay.json').then(function(r){return r.json();});
}).then(function(o){
  state.overlay = o;
  route();
}).catch(function(){ /* list is pre-rendered; detail just won't open */ });

function applyFilters(){
  var q = state.q.trim().toLowerCase();
  var fam = state.fam;
  var visible = 0;
  var occs = listEl.querySelectorAll('.occ');
  occs.forEach(function(a){
    var okFam = (fam==='all' || a.getAttribute('data-fam')===fam);
    var okQ = (!q || a.getAttribute('data-title').indexOf(q)>-1);
    var show = okFam && okQ;
    a.style.display = show ? '' : 'none';
    if(show) visible++;
  });
  listEl.querySelectorAll('.fam').forEach(function(sec){
    var any = Array.prototype.some.call(sec.querySelectorAll('.occ'), function(a){return a.style.display!=='none';});
    sec.style.display = any ? '' : 'none';
  });
  emptyEl.style.display = visible ? 'none' : 'block';
}

document.getElementById('q').addEventListener('input', function(e){
  state.q = e.target.value; applyFilters();
});
document.getElementById('famchips').addEventListener('click', function(e){
  var b = e.target.closest('.chip'); if(!b) return;
  state.fam = b.getAttribute('data-fam');
  this.querySelectorAll('.chip').forEach(function(c){c.setAttribute('aria-pressed', c===b ? 'true':'false');});
  applyFilters();
});

function findOcc(ssoc){
  if(!state.spine) return null;
  for(var i=0;i<state.spine.occupations.length;i++)
    if(state.spine.occupations[i].ssoc===ssoc) return state.spine.occupations[i];
  return null;
}
function findRoles(ssoc){
  if(!state.overlay) return [];
  return state.overlay.roles.filter(function(r){return r.mom_ssoc===ssoc && r.wages;});
}
function findRole(rid){
  if(!state.overlay) return null;
  for(var i=0;i<state.overlay.roles.length;i++)
    if(state.overlay.roles[i].role_id===rid) return state.overlay.roles[i];
  return null;
}
function famTitle(code){
  if(!state.spine) return '';
  for(var i=0;i<state.spine.groups.length;i++)
    if(state.spine.groups[i].code===code) return state.spine.groups[i].title;
  return '';
}

function pathBox(r){
  var h = '<div class="pathbox"><h3>Switcher path: '+esc(r.title)+'</h3>';
  if(r.path_summary) h += '<p class="kv">'+esc(r.path_summary)+'</p>';
  if(r.reskill.fee_label) h += '<p class="kv"><b>'+esc(r.reskill.fee_label)+'.</b> <span class="fine">Source: '+esc(r.reskill.source||'index research')+'</span></p>';
  if(r.gate.detail) h += '<p class="kv"><b>Requirement:</b> '+esc(r.gate.detail)+(r.gate.source?' <span class="fine">Source: '+esc(r.gate.source)+'.</span>':'')+'</p>';
  h += '<p class="kv"><span class="pill">Demand: '+esc(r.demand.class)+'</span><span class="fine">editorial note, '+esc(r.demand.vintage)+'; source: '+esc(r.demand.source)+'</span></p>';
  if(r.shares_row_with && r.shares_row_with.length)
    h += '<p class="kv fine">Same published MOM row as '+esc(r.shares_row_with.join(', '))+'; not a separate measurement.</p>';
  h += '</div>';
  return h;
}

function openOcc(ssoc){
  var o = findOcc(ssoc);
  if(!o){ closeDetail(); return; }
  var roles = findRoles(ssoc);
  var b=o.basic, g=o.gross;
  var h = '<button class="closebtn" id="closebtn">Close</button>';
  h += '<h2>'+esc(o.title)+'</h2>';
  h += '<div class="ssoc">SSOC 2024 '+esc(o.ssoc)+' &middot; '+esc(famTitle(o.group))+'</div>';
  h += '<table class="wagetable"><tr><th></th><th>25th percentile</th><th>Median</th><th>75th percentile</th></tr>';
  h += '<tr><td>Basic wage</td><td>'+money(b.p25)+'</td><td>'+money(b.p50)+'</td><td>'+money(b.p75)+'</td></tr>';
  h += '<tr><td>Gross wage</td><td>'+money(g.p25)+'</td><td>'+money(g.p50)+'</td><td>'+money(g.p75)+'</td></tr></table>';
  h += '<p class="fine">'+CAVEATS+'</p>';
  roles.forEach(function(r){
    if(r.band_status==='proxy')
      h += '<div class="warn">This pay band was measured for <b>'+esc(o.title)+'</b>, not for '+esc(r.title)+'. Treat it as a nearby reference, not this role\u2019s pay.</div>';
    h += pathBox(r);
  });
  h += '<p class="fine">Source: MRSD, MOM, Occupational Wage Survey 2025, Table 4 (All Industries).</p>';
  cardEl.innerHTML = h;
  detailEl.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('closebtn').addEventListener('click', closeDetail);
}

function openRole(rid){
  var r = findRole(rid);
  if(!r || r.band_status!=='withheld'){ closeDetail(); return; }
  var h = '<button class="closebtn" id="closebtn">Close</button>';
  h += '<h2>'+esc(r.title)+'</h2>';
  h += '<div class="ssoc">Career index role &middot; no official pay band</div>';
  h += '<div class="warn"><b>No MOM row is a fair proxy, so the pay band is withheld rather than guessed.</b> '+esc(r.withheld_reason||'')+'</div>';
  if(r.mom_ssoc){
    var off = findOcc(r.mom_ssoc);
    if(off) h += '<p class="kv fine">Nearest official occupation, a different job: <a href="#occ-'+esc(off.ssoc)+'">'+esc(off.title)+'</a> (SSOC '+esc(off.ssoc)+'). Its figures are not shown here.</p>';
  } else {
    h += '<p class="kv fine">No single official occupation is close enough to name. <a href="#fam-'+esc(r.withheld_family)+'">Browse the official '+esc(famTitle(r.withheld_family))+' occupations</a> instead.</p>';
  }
  h += pathBox(r);
  h += '<p class="fine">Reskill path: GetHowMuch career index research, 2026 (editorial). Pay figures: none published for this role at the survey\u2019s occupation grain.</p>';
  cardEl.innerHTML = h;
  detailEl.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('closebtn').addEventListener('click', closeDetail);
}

function closeDetail(){
  detailEl.classList.remove('open');
  document.body.style.overflow = '';
  if(/^#(occ|role)-/.test(location.hash)) history.replaceState(null,'',location.pathname+location.search);
}
detailEl.addEventListener('click', function(e){ if(e.target===detailEl) closeDetail(); });
document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeDetail(); });

function route(){
  var m = location.hash.match(/^#occ-(\d+)$/);
  if(m){ openOcc(m[1]); return; }
  var m2 = location.hash.match(/^#role-([A-Za-z0-9]+)$/);
  if(m2){ openRole(m2[1]); return; }
  var m3 = location.hash.match(/^#fam-(\d+)$/);
  if(m3){
    closeDetail();
    var sec = document.getElementById('fam-'+m3[1]);
    if(sec && sec.scrollIntoView) sec.scrollIntoView();
    return;
  }
  closeDetail();
}
window.addEventListener('hashchange', route);
})();
