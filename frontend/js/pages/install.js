// Attach the submit handler FIRST and unconditionally — this must never depend
// on the status check below succeeding, or a network hiccup would silently
// leave the form with no handler at all (causing a plain browser page reload
// with no error shown when the button is clicked).
document.getElementById('installForm').addEventListener('submit', async(e) => {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Installing…';
    }

    try {
        const form = new FormData(e.target);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // give up after 15s instead of hanging forever

        let res;
        try {
            res = await fetch(apiUrl('/install.php'), { method: 'POST', credentials: 'same-origin', body: form, signal: controller.signal });
        } catch (fetchErr) {
            if (fetchErr.name === 'AbortError') {
                showFlash('The server took too long to respond (over 15 seconds). This usually means it is stuck trying to reach MySQL. Double-check MySQL is running and the host/port are correct, then try again.', 'error');
            } else {
                showFlash('Could not reach the server. Check your network connection and that the backend/api/install.php file exists.', 'error');
            }
            return;
        } finally {
            clearTimeout(timeoutId);
        }

        let data;
        try {
            data = await res.json();
        } catch (parseErr) {
            showFlash('The server returned an unexpected response (not JSON). Check your PHP error log for a fatal error.', 'error');
            return;
        }

        if (data.success) {
            document.getElementById('content').innerHTML = `
        <div class="alert alert-ok"><i class="bi bi-check-circle"></i> Installation complete. Your Super Administrator account has been created.</div>
        <a class="btn btn-primary btn-block" href="auth/login.html"><i class="bi bi-box-arrow-in-right"></i> Continue to Login</a>`;
        } else {
            showFlash(data.message || 'Installation failed.', 'error');
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml;
        }
    }
});

// Separately, check whether the system is already installed. If this fails for
// any reason, it must NOT affect the submit handler above.
(async function() {
    try {
        const statusRes = await fetch(apiUrl('/install.php'), { credentials: 'same-origin' });
        const status = await statusRes.json();

        if (status.installed) {
            document.getElementById('content').innerHTML = `
        <div class="alert alert-info"><i class="bi bi-info-circle"></i> The system is already installed. <a href="auth/login.html">Go to login</a>.</div>`;
        }
    } catch (e) {
        // Ignore — worst case the form just stays visible, which is safe.
    }
})();