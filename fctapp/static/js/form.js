
function updateFormStatus() {

    var form = document.getElementById('myForm');
    
    form.addEventListener('submit', function(event) {
       
        event.preventDefault();
      
        document.getElementById('status').innerText = 'Form submitted!';
    });
}

document.addEventListener('DOMContentLoaded', updateFormStatus);
