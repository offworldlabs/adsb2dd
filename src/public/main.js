  function toggleCustomFields(fieldName) {
    const selectedOption = document.getElementById(fieldName).value;
    const customField = document.getElementById(`${fieldName}-custom`);

    if (selectedOption === 'custom') {
      customField.style.display = 'block';
    } else {
      customField.style.display = 'none';
    }
  }

  function toggleDataSource() {
    const dataSource = document.getElementById('dataSource').value;
    const serverUrlField = document.getElementById('serverUrlField');

    if (dataSource === 'tar1090') {
      serverUrlField.style.display = 'block';
    } else {
      serverUrlField.style.display = 'none';
    }
  }

  function isNumeric(value) {
    return !isNaN(parseFloat(value)) && isFinite(value);
  }

  function validateLatLonAlt(latLonAlt, field) {
    const components = latLonAlt.split(',');

    if (components.length !== 3 || !components.every(isNumeric)) {
      alert(`Invalid ${field}. Please enter three valid numbers separated by commas.`);
      return false;
    }

    return true;
  }

  function constructUrl() {
    const rxLocation = document.getElementById('rxLocation').value;
    const rxLocationCustom = document.getElementById('rxLocationCustom').value;
    const rx = (rxLocation === 'custom' ? rxLocationCustom : rxLocation);

    const txLocation = document.getElementById('txLocation').value;
    const txLocationCustom = document.getElementById('txLocationCustom').value;
    const tx = (txLocation === 'custom' ? txLocationCustom : txLocation);

    const fc = document.getElementById('fc').value;
    const dataSource = document.getElementById('dataSource').value;
    const serverName = document.getElementById('serverName').value;

    let server;
    if (dataSource === 'adsblol') {
      server = 'https://api.adsb.lol';
    } else {
      server = serverName;
    }

    // validation
    if (!rx || !tx || !fc) {
      alert('Please fill in all fields.');
      return;
    }
    if (dataSource === 'tar1090' && !serverName) {
      alert('Please provide tar1090 server URL.');
      return;
    }
    if (!validateLatLonAlt(rx, 'Receiver Location') ||
      !validateLatLonAlt(tx, 'Transmitter Location')) {
        return;
    }
    if (!isNumeric(fc)) {
      alert('Center frequency invalid');
      return;
    }

    var url = window.location.href + `api/dd?rx=${rx}&tx=${tx}&fc=${fc}&server=${server}`;
    url = url.replace(/\s/g, '');

    if (url) {
      window.open(url, '_blank'); // Open in a new tab or window
    }

    // create an anchor element
	  /*
    var linkElement = document.createElement('a');
    linkElement.href = url;
    linkElement.target = '_blank'; // Open in a new tab or window
    linkElement.textContent = url;

    // clear the previous content and append the link
    var generatedUrlElement = document.getElementById('generatedUrl');
    generatedUrlElement.innerHTML = '';
    generatedUrlElement.appendChild(linkElement);
    */
  }

