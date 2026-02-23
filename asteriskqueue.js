const net = require('net');

// Define the AMI credentials and server information
const ami_username = 'admin';
const ami_password = 'amp111';
const ami_port = 5038;
const ami_host = '10.170.7.32';

// Create a socket connection to the AMI server
const socket = net.createConnection({
  port: ami_port,
  host: ami_host
});

// Listen for incoming data on the socket
socket.on('data', (data) => {
  // Convert the incoming data to a string
  const response = data.toString();
    // console.log(data.toString())
  // Split the response into individual lines
  const lines = response.split('\r\n');
  {console.log(response);}
//   console.log('2')
  // Loop through each line of the response
  for (let i = 0; i < lines.length; i++) {
    // Split the line into individual key/value pairs
    const parts = lines[i].split(':');
    // console.log("i=",i,"parts",parts[1],"|", parts)
    if (parts[0]==='CallerIDnum')
        {console.log(parts[1]);}
    // Check if the line contains information about an active call
    // if (parts[0] === 'Event' && parts[1] === 'PeerStatus') {
    //   // Extract the details of the active call
    // //   console.log('in')
    //   const channel = getValueByKey(lines, 'Channel');
    //   const state = getValueByKey(lines, 'PeerStatus');
    //   const caller_id_number = getValueByKey(lines, 'CallerIDNum');
    //   const caller_id_name = getValueByKey(lines, 'CallerIDName');
    //   const connected_line_number = getValueByKey(lines, 'ConnectedLineNum');
    //   const connected_line_name = getValueByKey(lines, 'ConnectedLineName');
    // //   console.log('4')
    //   // Print the details of the active call to the console
    //   console.log(`Active call: ${channel} (${state})`);
    //   console.log(`Caller ID: ${caller_id_name} <${caller_id_number}>`);
    //   console.log(`Connected Line: ${connected_line_name} <${connected_line_number}>\n`);
    // }
  }
  // socket.end()
});

// Authenticate with the AMI server and retrieve the list of active calls
socket.write(`Action: Login\r\nUsername: ${ami_username}\r\nSecret: ${ami_password}\r\n\r\n`);
socket.write('Action: CoreShowChannels\r\n\r\n');

/**
 * Helper function to extract a value from a list of key/value pairs
 *
 * @param {string[]} lines The list of key/value pairs to search through
 * @param {string} key The key to search for
 * @returns {string} The value associated with the key, or an empty string if the key is not found
 */
// function getValueByKey(lines, key) {
//     // console.log('get')
//   for (let i = 0; i < lines.length; i++) {
//     const parts = lines[i].split(':');
//     if (parts[0] === key) {
//       return parts[1].trim();
//     }
//   }
//   return '';
// }

