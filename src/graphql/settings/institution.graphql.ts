import { gql } from "@apollo/client";
import { basePaginationResponse, baseResponse } from "../response.graphql";

export const institutionData = `
    id
    institutionUniqueId
    institutionName
    institutionAddress
    institutionEmail
    institutionPhoneNumber
    institutionWebsite
    institutionEstablishedDate
    institutionLogo
    institutionDescription
    institutionIsActive
    institutionCreatedDate
`;

export const CREATE_INSTITUTION = gql`
mutation CreateInstitution($input: InstitutionInputObject!) {
  createInstitution(input: $input) {
    data {
        ${institutionData}
    }
    ${baseResponse}
  }
}
`;

export const DELETE_INSTITUTION = gql`
mutation DeleteInstitution($institutionUniqueId: String!){
  deleteInstitution(institutionUniqueId:$institutionUniqueId){
    {baseResponse}
  }
}
`;

export const GET_INSTITUTION = gql`
query GetInstitution{
  getInstitution(filtering:InstitutionFilteringObject){
    data {
        ${institutionData}
    }
    ${baseResponse}
    ${basePaginationResponse}
    
  }
}
`;
