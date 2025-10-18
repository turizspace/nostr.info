---
layout: none
permalink: /js/resources.js
---

window.resources = [
{% assign ps = "" | split: "" %}
{%- for p in site.nostrResources -%}
  {% if p.tags %}
    {% assign ps = ps | push: p %}
  {% endif %}
{%- endfor -%}
{%- for p in ps -%}
  {
    "title": "{{ p.title }}",
    "permalink": "{{ p.permalink }}",
    "web": "{{ p.web }}",
    "github": "{{ p.github }}",
    "authorNPub": "{{ p.authorNPub }}",
    "instances": {{ p.instances | jsonify }},
    "tags": {{ p.tags | jsonify }},
    "platforms": {{ p.platforms | jsonify }},
    "nips": {{ p.nips | jsonify }},
    "license": "{{ p.license }}"
  }{% unless forloop.last %},{% endunless %}
{%- endfor -%}
]
window.activeTags = ["client"]
{% assign p = site.nostrResources | map: "platforms" %}
{% assign t = site.nostrResources | map: "tags" %}
{% assign n = site.nostrResources | map: "nips" %}
window.allTags = {{ p | concat: t | concat: n | compact | uniq | jsonify }}

window.addEventListener("load", () => {
  update()
  setupSearch()
})

const toggles = document.getElementById("toggles")

function setupSearch() {
  const searchInput = document.getElementById("searchInput")
  if (searchInput) {
    searchInput.addEventListener("input", debounce((e) => {
      const searchTerm = e.target.value.toLowerCase()
      filterResults(searchTerm)
    }, 300))
  }
}

function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

function filterResults(searchTerm) {
  const results = document.querySelectorAll('.result')
  results.forEach(result => {
    const title = result.querySelector('.name').textContent.toLowerCase()
    const description = result.querySelector('.dev').textContent.toLowerCase()
    const isVisible = title.includes(searchTerm) || description.includes(searchTerm)
    
    if (window.activeTags.length === 0) {
      result.style.display = isVisible ? 'block' : 'none'
    } else {
      result.style.display = isVisible && result.matches('.' + window.activeTags.join('.')) ? 'block' : 'none'
    }
  })
}

function clickTag(t) {
  if (window.activeTags.includes(t)) {
    window.activeTags.splice(window.activeTags.indexOf(t), 1)
  } else {
    window.activeTags.push(t)
  }
  console.log(window.activeTags)
  update()
}

function updateAvailableTags() {
  if (window.activeTags.length) {
    window.availableTags = []
    function addFrom(name) {
      window.availableTags.push(
        ...new Set(
          window.resources.filter(st => {
            const t = (st.tags || [])
              .concat(st.platforms || [])
              .concat(st.nips || [])
            return window
              .activeTags
              .every( it => t.includes(it) )
          })
          .map(it => it[name] || [])
          .flat()
        )
      )
    }
    addFrom('platforms')
    addFrom('tags')
    addFrom('nips')
  } else {
    window.availableTags = window.allTags
  }
}

function addToggle(name, cls) {
  const btn = document.createElement("div")
  btn.setAttribute("class", `tag ${name} ${cls}`)
  btn.setAttribute("onclick", `clickTag('${name}')`)
  btn.innerHTML = name
  toggles.append(btn)
}

function update() {
  updateAvailableTags()
  toggles.replaceChildren()
  window.activeTags.forEach(t => {
    addToggle(t, 'active')
  })
  window.availableTags.forEach(t => {
    if (window.activeTags.includes(t))
      return
    addToggle(t, 'available')
  })
  window.allTags.forEach(t => {
    if (window.activeTags.includes(t) || window.availableTags.includes(t))
      return
    addToggle(t, 'unavailable')
  })
  if (window.activeTags.length) {
    document.querySelectorAll('.result').forEach(it => it.style.display = 'none')
    document.querySelectorAll(`.result.${window.activeTags.join(".")}`).forEach(it => it.style.display = 'block')
  } else {
    document.querySelectorAll('.result').forEach(it => it.style.display = 'block')
  }
}
