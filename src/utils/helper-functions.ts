
export function makeId(length:number) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    return result;
}




export const accessObject = (obj:any, path:any) => {

  return path.split('.').reduce((prev:any, curr:any) => (prev ? prev[curr] : undefined), obj);
};


export const fileToBase64 = (file:any) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
});


export const checkIfFileIsImage = (fileName: string) => {
  const imageExtensions = [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "bmp",
    "tiff",
    "webp",
    "svg",
  ];

  if (imageExtensions.includes(fileName.split(".")[1])) {
    return true;
  }

  return false;
};