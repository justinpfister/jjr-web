(function init() {
    function renderLatestPhoto(container) {
        fetch('/api/latest-photo').then(function (r) {
            if (r.status === 204) return null;
            return r.json();
        }).then(function (data) {
            if (!data || !data.url) return;
            var figure = document.createElement('figure');
            var img = document.createElement('img');
            img.src = data.url;
            img.alt = data.description || 'Latest photo';
            img.style.maxWidth = '100%';
            img.style.borderRadius = '8px';
            figure.appendChild(img);
            if (data.description) {
                var cap = document.createElement('figcaption');
                cap.className = 'muted';
                cap.textContent = data.description;
                figure.appendChild(cap);
            }
            container.appendChild(figure);
        }).catch(function () { /* ignore */ });
    }

    document.addEventListener('DOMContentLoaded', function () {
        var hero = document.querySelector('.hero');
        if (hero) {
            var latest = document.createElement('div');
            latest.className = 'latest-photo';
            hero.appendChild(latest);
            renderLatestPhoto(latest);
        }

        var latestList = document.getElementById('latestList');
        if (latestList) {
            fetch('/api/content', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (items) {
                latestList.innerHTML = '';
                items.slice(0, 5).forEach(function (item) {
                    var li = document.createElement('li');
                    var a = document.createElement('a');
                    a.href = item.href;
                    a.textContent = item.name;
                    li.appendChild(a);
                    latestList.appendChild(li);
                });
            }).catch(function () { /* ignore */ });
        }
    });
})();

