

export const loginAsync = async () => {
  
  // Simulate an asynchronous login operation (e.g., API call)
  return new Promise<{ success: boolean; message: string }>((resolve) => {
    setTimeout(() => {
      // For demonstration, we assume the login is always successful
      resolve({ success: true, message: "Login successful!" });
    }, 1000); // Simulate a 1-second delay
  });
 
};
