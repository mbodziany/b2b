document.addEventListener('DOMContentLoaded', function () {
  var roleSelect = document.getElementById('role');
  if (!roleSelect) {
    return;
  }
  var clinicGroup = document.getElementById('clinic-field-group');
  var permissionsGroup = document.getElementById('permissions-field-group');

  function update() {
    var isClinicUser = roleSelect.value === 'CLINIC_USER';
    if (clinicGroup) {
      clinicGroup.hidden = !isClinicUser;
    }
    if (permissionsGroup) {
      permissionsGroup.hidden = !isClinicUser;
    }
  }

  roleSelect.addEventListener('change', update);
  update();
});
