export function showMessage(element, message, type = 'success', duration = 3000) {
    if (!element) return;
    element.textContent = message;
    element.className = `message ${type}`;
    setTimeout(() => {
        element.textContent = '';
        element.className = 'message';
    }, duration);
}